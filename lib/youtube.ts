// YouTube Data API v3 — public data only, cheap calls only.
// Cost per audit: channels.list (1) + playlistItems.list (1) + videos.list (1) = ~3 units.
// Never uses search.list.
import sharp from "sharp";
import type { RawVideo } from "./auditEngine";

const API = "https://www.googleapis.com/youtube/v3";

export interface ChannelInfo {
  id: string;
  title: string;
  url: string;
  subscriberCount: number | null;
  uploadsPlaylist: string;
}

function key() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY is not configured on the server.");
  return k;
}

async function yt(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: key() });
  const res = await fetch(`${API}/${path}?${qs.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API error (${res.status}): ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** Accept @handle, a full youtube.com URL, a UC… channel ID, or a bare handle. */
export function parseChannelInput(input: string): { handle?: string; id?: string } {
  const s = input.trim();
  const idMatch = s.match(/UC[\w-]{22}/);
  if (/^UC[\w-]{22}$/.test(s) && idMatch) return { id: s };
  const handleInUrl = s.match(/youtube\.com\/(@[\w.\-]+)/i);
  if (handleInUrl) return { handle: handleInUrl[1] };
  const channelInUrl = s.match(/youtube\.com\/channel\/(UC[\w-]{22})/i);
  if (channelInUrl) return { id: channelInUrl[1] };
  if (s.startsWith("@")) return { handle: s };
  if (/^[\w.\-]+$/.test(s)) return { handle: "@" + s };
  if (idMatch) return { id: idMatch[0] };
  throw new Error("Could not read that as a channel. Paste a channel URL, an @handle, or a channel ID (UC…).");
}

export async function getChannel(input: string): Promise<ChannelInfo> {
  const parsed = parseChannelInput(input);
  const params: Record<string, string> = { part: "snippet,statistics,contentDetails" };
  if (parsed.id) params.id = parsed.id; else params.forHandle = parsed.handle!;
  const data = await yt("channels", params);
  const item = data.items?.[0];
  if (!item) throw new Error("Channel not found. Check the handle/URL — the channel must be public.");
  return {
    id: item.id,
    title: item.snippet?.title ?? "Unknown channel",
    url: `https://www.youtube.com/channel/${item.id}`,
    subscriberCount: item.statistics?.hiddenSubscriberCount ? null : Number(item.statistics?.subscriberCount ?? NaN) || null,
    uploadsPlaylist: item.contentDetails?.relatedPlaylists?.uploads,
  };
}

function parseDuration(iso: string): number {
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/** 64-bit average hash (aHash) of a thumbnail image, as 16 hex chars. */
export async function thumbnailHash(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const { data } = await sharp(buf).resize(8, 8, { fit: "fill" }).grayscale().raw().toBuffer({ resolveWithObject: true });
    let avg = 0;
    for (let i = 0; i < data.length; i++) avg += data[i];
    avg /= data.length;
    const bits: number[] = [];
    for (let i = 0; i < data.length; i++) bits.push(data[i] >= avg ? 1 : 0);
    let hex = "";
    for (let i = 0; i < 64; i += 4) {
      hex += parseInt(bits.slice(i, i + 4).join(""), 2).toString(16);
    }
    return hex.padStart(16, "0");
  } catch {
    return null;
  }
}

import type { FinderFilters, FoundVideo, ChannelStats } from "./finder";

/**
 * Viral Content Finder discovery.
 * Cost: search.list is 100 units per page — we cap at 3 pages (~300 units),
 * then videos.list + channels.list in batches of 50 (1 unit each batch).
 */
export async function searchViralVideos(f: FinderFilters): Promise<{ videos: FoundVideo[]; channels: Map<string, ChannelStats> }> {
  const videoIds: string[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 3; page++) {
    const params: Record<string, string> = {
      part: "snippet", type: "video", order: "viewCount", maxResults: "50",
      q: f.keyword,
    };
    if (f.dateFrom) params.publishedAfter = new Date(f.dateFrom + "T00:00:00Z").toISOString();
    if (f.dateTo) params.publishedBefore = new Date(f.dateTo + "T23:59:59Z").toISOString();
    if (f.type === "shorts") params.videoDuration = "short"; // <4 min bucket; exact ≤60s filter happens later
    if (pageToken) params.pageToken = pageToken;
    const data = await yt("search", params);
    for (const item of data.items ?? []) {
      if (item.id?.videoId) videoIds.push(item.id.videoId);
    }
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  if (!videoIds.length) return { videos: [], channels: new Map() };

  const videos: FoundVideo[] = [];
  const channelIds = new Set<string>();
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);
    const vd = await yt("videos", { part: "snippet,contentDetails,statistics", id: batch.join(",") });
    for (const v of vd.items ?? []) {
      const durationSec = parseDuration(v.contentDetails?.duration ?? "");
      const cid = v.snippet?.channelId;
      if (!cid) continue;
      channelIds.add(cid);
      videos.push({
        id: v.id,
        title: v.snippet?.title ?? "",
        url: `https://www.youtube.com/watch?v=${v.id}`,
        views: Number(v.statistics?.viewCount ?? 0),
        publishedAt: v.snippet?.publishedAt ?? "",
        durationSec,
        isShort: durationSec > 0 && durationSec <= 60,
        channelId: cid,
      });
    }
  }

  const channels = new Map<string, ChannelStats>();
  const cids = [...channelIds];
  for (let i = 0; i < cids.length; i += 50) {
    const batch = cids.slice(i, i + 50);
    const cd = await yt("channels", { part: "snippet,statistics", id: batch.join(",") });
    for (const c of cd.items ?? []) {
      channels.set(c.id, {
        id: c.id,
        title: c.snippet?.title ?? "Unknown channel",
        url: `https://www.youtube.com/channel/${c.id}`,
        subs: c.statistics?.hiddenSubscriberCount ? null : (Number(c.statistics?.subscriberCount ?? NaN) || null),
        createdAt: c.snippet?.publishedAt ?? "",
        description: c.snippet?.description ?? "",
      });
    }
  }
  return { videos, channels };
}

import { extractSeedKeywords } from "./finder";

export interface ReferenceSeed {
  channelId: string;
  title: string;
  url: string;
  subs: number | null;
  keywords: string;
}

/** Resolve a reference channel and derive a niche seed query from its recent titles. Cost: ~3 units. */
export async function getReferenceSeed(input: string): Promise<ReferenceSeed> {
  const ch = await getChannel(input);
  const pl = await yt("playlistItems", { part: "contentDetails", playlistId: ch.uploadsPlaylist, maxResults: "15" });
  const ids = (pl.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  let titles: string[] = [];
  if (ids.length) {
    const vd = await yt("videos", { part: "snippet", id: ids.join(",") });
    titles = (vd.items ?? []).map((v: any) => v.snippet?.title ?? "").filter(Boolean);
  }
  return { channelId: ch.id, title: ch.title, url: ch.url, subs: ch.subscriberCount, keywords: extractSeedKeywords(ch.title, titles) };
}

export async function getRecentVideos(uploadsPlaylist: string, max = 30): Promise<RawVideo[]> {
  const pl = await yt("playlistItems", { part: "contentDetails", playlistId: uploadsPlaylist, maxResults: String(max) });
  const ids = (pl.items ?? []).map((i: any) => i.contentDetails?.videoId).filter(Boolean);
  if (!ids.length) return [];
  const vd = await yt("videos", { part: "snippet,contentDetails", id: ids.join(",") });
  const byId = new Map<string, any>((vd.items ?? []).map((v: any) => [v.id, v]));
  const videos: RawVideo[] = [];
  for (const id of ids) {
    const v = byId.get(id);
    if (!v) continue;
    const thumb = v.snippet?.thumbnails?.medium?.url ?? v.snippet?.thumbnails?.default?.url;
    videos.push({
      id,
      title: v.snippet?.title ?? "",
      description: v.snippet?.description ?? "",
      publishedAt: v.snippet?.publishedAt ?? "",
      durationSec: parseDuration(v.contentDetails?.duration ?? ""),
      thumbnailHash: thumb ? await thumbnailHash(thumb) : null,
    });
  }
  return videos;
}
