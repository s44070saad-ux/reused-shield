// Viral Content Finder — pure filtering / grouping logic.
// Discovery data comes from the YouTube Data API (see lib/youtube.ts searchViralVideos).
// "Likely faceless" is a niche-style HEURISTIC and is always labelled as a guess.

export interface FinderFilters {
  keyword: string;
  referenceChannel?: string; // channel URL/@handle/ID the search was seeded from (id form after resolving)
  dateFrom?: string; // YYYY-MM-DD
  dateTo?: string; // YYYY-MM-DD
  type: "all" | "shorts" | "long";
  minViews?: number;
  maxViews?: number;
  minSubs?: number;
  maxSubs?: number;
  maxChannelAgeYears?: number;
  facelessOnly?: boolean;
}

export interface FoundVideo {
  id: string;
  title: string;
  url: string;
  views: number;
  publishedAt: string;
  durationSec: number;
  isShort: boolean;
  channelId: string;
}

export interface ChannelStats {
  id: string;
  title: string;
  url: string;
  subs: number | null; // null = hidden
  createdAt: string; // channel creation date
  description: string;
}

export interface FinderChannel {
  id: string;
  title: string;
  url: string;
  subs: number | null;
  channelAgeYears: number;
  likelyFaceless: boolean;
  topViews: number;
  viralRatio: number | null; // top video views / subs — the breakout signal
  videos: FoundVideo[]; // top 3, views desc
}

const FACELESS_LEXICON = [
  "facts", "story", "stories", "quiz", "history", "mystery", "mysteries", "horror",
  "top 10", "top10", "top 5", "explained", "documentary", "reddit", "scary",
  "true crime", "space", "geography", "comparison", "sleep", "relaxing", "ai news",
  "celebrity", "animals", "wildlife", "nature", "fails", "moments", "countdown",
];

export function isLikelyFaceless(channelTitle: string, channelDescription: string, videoTitles: string[]): boolean {
  const chanHay = (channelTitle + " " + channelDescription).toLowerCase();
  if (FACELESS_LEXICON.some((w) => chanHay.includes(w))) return true;
  // Otherwise require the pattern across at least 2 video titles — one "story" in a title proves nothing.
  const hits = videoTitles.filter((t) => FACELESS_LEXICON.some((w) => t.toLowerCase().includes(w))).length;
  return hits >= 2;
}

export function applyFilters(videos: FoundVideo[], channels: Map<string, ChannelStats>, f: FinderFilters, now = new Date()): FinderChannel[] {
  const byChannel = new Map<string, FoundVideo[]>();
  for (const v of videos) {
    if (f.type === "shorts" && !v.isShort) continue;
    if (f.type === "long" && v.isShort) continue;
    if (f.minViews != null && v.views < f.minViews) continue;
    if (f.maxViews != null && v.views > f.maxViews) continue;
    const arr = byChannel.get(v.channelId) ?? [];
    arr.push(v);
    byChannel.set(v.channelId, arr);
  }

  const out: FinderChannel[] = [];
  for (const [cid, vids] of byChannel) {
    const ch = channels.get(cid);
    if (!ch) continue;
    if (f.minSubs != null && (ch.subs == null || ch.subs < f.minSubs)) continue;
    if (f.maxSubs != null && (ch.subs == null || ch.subs > f.maxSubs)) continue;
    const ageYears = (now.getTime() - new Date(ch.createdAt).getTime()) / (365.25 * 86400000);
    if (f.maxChannelAgeYears != null && ageYears > f.maxChannelAgeYears) continue;
    const sorted = [...vids].sort((a, b) => b.views - a.views);
    const top = sorted[0];
    const faceless = isLikelyFaceless(ch.title, ch.description, vids.map((v) => v.title));
    if (f.facelessOnly && !faceless) continue;
    out.push({
      id: ch.id,
      title: ch.title,
      url: ch.url,
      subs: ch.subs,
      channelAgeYears: Math.round(ageYears * 10) / 10,
      likelyFaceless: faceless,
      topViews: top.views,
      viralRatio: ch.subs && ch.subs > 0 ? Math.round((top.views / ch.subs) * 10) / 10 : null,
      videos: sorted.slice(0, 3),
    });
  }
  out.sort((a, b) => b.topViews - a.topViews);
  return out.slice(0, 25);
}

export function finderKey(f: FinderFilters): string {
  return [f.keyword.trim().toLowerCase(), f.referenceChannel ?? "", f.dateFrom ?? "", f.dateTo ?? "", f.type, f.minViews ?? "", f.maxViews ?? "", f.minSubs ?? "", f.maxSubs ?? "", f.maxChannelAgeYears ?? "", f.facelessOnly ? "fl" : ""].join("|");
}

const SEED_STOP = new Set([
  "the","a","an","of","to","in","on","for","and","or","vs","with","how","why","what","is","it",
  "official","video","videos","new","ft","feat","episode","ep","part","full","hd","4k","2024","2025","2026",
  "my","i","you","your","this","that","from","by","at","be","are","was","were","will","can","not","no","yes",
  "shorts","short","viral","best","top","get","got","one","all","about","into","out","up","down","over","after","before",
]);

/** Derive a niche seed query from a reference channel's recent video titles. */
export function extractSeedKeywords(channelTitle: string, videoTitles: string[]): string {
  const counts = new Map<string, number>();
  const bump = (w: string) => { if (w.length >= 3 && !SEED_STOP.has(w)) counts.set(w, (counts.get(w) ?? 0) + 1); };
  for (const t of videoTitles) {
    const words = t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    words.forEach(bump);
    for (let i = 0; i + 1 < words.length; i++) {
      const bg = words[i] + " " + words[i + 1];
      if (!SEED_STOP.has(words[i]) && !SEED_STOP.has(words[i + 1])) counts.set(bg, (counts.get(bg) ?? 0) + 1.5);
    }
  }
  const chanWords = new Set(channelTitle.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/));
  const ranked = [...counts.entries()]
    .filter(([w]) => !chanWords.has(w)) // drop the channel's own name words
    .sort((a, b) => b[1] - a[1]);
  const picks: string[] = [];
  const usedWords = new Set<string>();
  for (const [w] of ranked) {
    if (picks.length >= 2) break;
    const words = w.split(" ");
    if (words.some((x) => usedWords.has(x))) continue; // no overlapping picks like "scary horror" + "horror story"
    picks.push(w);
    words.forEach((x) => usedWords.add(x));
  }
  return picks.join(" ");
}
