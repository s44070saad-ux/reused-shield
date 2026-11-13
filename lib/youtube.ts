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
