// Channel Breakdown — FACTS ONLY.
// Everything here is computed from PUBLIC metadata (titles, views, dates,
// durations, thumbnails) plus the same audit engine that scores reused-
// content risk. Counts are true counts over the sampled videos. Interpretive
// lines are labelled observations tied to the numbers shown — this module
// deliberately produces NO prescriptive "plan": no schedules, no promises,
// no generic playbook dressed up as channel-specific strategy.
import { runAudit, normalizeTitle, titleTokens, type RawVideo } from "./auditEngine";

export interface BreakdownVideo extends RawVideo {
  views: number;
}

export interface ChannelInfo {
  id: string;
  title: string;
  url: string;
  subs: number | null;
  createdAt?: string;
}

export interface Pillar { label: string; count: number; examples: string[] }
export interface TopVideo { title: string; views: number; ratio: number | null; url: string }

export interface Breakdown {
  channel: { title: string; url: string; subs: number | null; ageYears: number | null };
  metrics: {
    videosSampled: number; uploadsPerWeek: number; avgViews: number; medianViews: number;
    shortsPct: number; avgLongDurationSec: number; topVideoViews: number;
  };
  risk: { score: number; level: string };
  pillars: Pillar[];
  topVideos: TopVideo[];
  topOpenings: { phrase: string; count: number }[];
  strengths: string[];   // "What's working" — observations tied to the numbers
  weaknesses: string[];  // "Gaps & weaknesses" — observations tied to the numbers
  riskNotes: string[];   // this channel's template fingerprints (from the audit)
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function buildBreakdown(channel: ChannelInfo, videos: BreakdownVideo[]): Breakdown {
  const n = videos.length;
  const audit = runAudit(videos);
  const subs = channel.subs;

  // ── Metrics ──────────────────────────────────────────────────────────────
  const dates = videos.map((v) => new Date(v.publishedAt).getTime()).filter((x) => !Number.isNaN(x)).sort((a, b) => a - b);
  const spanWeeks = dates.length > 1 ? Math.max(1, (dates[dates.length - 1] - dates[0]) / (7 * 86400000)) : 1;
  const uploadsPerWeek = Math.round((n / spanWeeks) * 10) / 10;
  const views = videos.map((v) => v.views);
  const shorts = videos.filter((v) => v.durationSec <= 60);
  const longs = videos.filter((v) => v.durationSec > 60);
  const metrics = {
    videosSampled: n,
    uploadsPerWeek,
    avgViews: Math.round(views.reduce((a, b) => a + b, 0) / Math.max(1, n)),
    medianViews: median(views),
    shortsPct: n ? Math.round((shorts.length / n) * 100) : 0,
    avgLongDurationSec: longs.length ? Math.round(longs.reduce((a, v) => a + v.durationSec, 0) / longs.length) : 0,
    topVideoViews: views.length ? Math.max(...views) : 0,
  };

  // ── Pillars (title keyword clusters) ─────────────────────────────────────
  // count = TRUE number of sampled videos whose title contains the phrase.
  const freq = new Map<string, number>();
  for (const v of videos) {
    const toks = [...new Set(titleTokens(v.title))];
    toks.forEach((t) => freq.set(t, (freq.get(t) ?? 0) + 1));
    for (let i = 0; i + 1 < toks.length; i++) {
      const bg = toks[i] + " " + toks[i + 1];
      freq.set(bg, (freq.get(bg) ?? 0) + 1);
    }
  }
  const chanWords = new Set(normalizeTitle(channel.title).split(" "));
  // Prefer two-word phrases ("horror stories") over single generic words ("story").
  const candidates = [...freq.entries()]
    .filter(([w, c]) => c >= 2 && !chanWords.has(w) && !/^\d+$/.test(w)) // pure numbers ("part 1") are not pillars
    .sort((a, b) => (b[0].includes(" ") ? 1 : 0) - (a[0].includes(" ") ? 1 : 0) || b[1] - a[1]);
  const pillars: Pillar[] = [];
  const coveredWords = new Set<string>();
  const chosenSets: { label: string; ids: Set<string> }[] = [];
  for (const [label] of candidates) {
    if (pillars.length >= 4) break;
    if (!label.includes(" ") && coveredWords.has(label)) continue; // unigram already inside a chosen phrase
    if (label.split(" ").some((w) => chanWords.has(w))) continue;
    // Phrases match by substring; single words match by whole token (so "1"
    // never matches "10"/"15" and "art" never matches "start").
    const matching = label.includes(" ")
      ? videos.filter((v) => normalizeTitle(v.title).includes(label))
      : videos.filter((v) => titleTokens(v.title).includes(label));
    if (matching.length < 2) continue;
    // Skip chained fragments of an already-chosen phrase: if this phrase
    // matches (almost) the same videos as a chosen phrase, it IS that pillar.
    const ids = new Set(matching.map((v) => v.id));
    const isFragment = chosenSets.some((c) => {
      let inter = 0;
      ids.forEach((id) => { if (c.ids.has(id)) inter++; });
      return inter / Math.max(1, ids.size) >= 0.8;
    });
    if (isFragment) continue;
    label.split(" ").forEach((w) => coveredWords.add(w));
    chosenSets.push({ label, ids });
    pillars.push({ label, count: matching.length, examples: matching.slice(0, 3).map((v) => v.title) });
  }

  // ── Openings ─────────────────────────────────────────────────────────────
  const openFreq = new Map<string, number>();
  for (const v of videos) {
    const o = normalizeTitle(v.title).split(" ").slice(0, 3).join(" ");
    if (o) openFreq.set(o, (openFreq.get(o) ?? 0) + 1);
  }
  const topOpenings = [...openFreq.entries()].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([phrase, count]) => ({ phrase, count }));

  const topVideos: TopVideo[] = [...videos].sort((a, b) => b.views - a.views).slice(0, 5)
    .map((v) => ({ title: v.title, views: v.views, ratio: subs ? Math.round((v.views / subs) * 10) / 10 : null, url: `https://www.youtube.com/watch?v=${v.id}` }));

  // ── Observations (each line is arithmetic on the numbers above) ─────────
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const best = topVideos[0];
  if (best?.ratio != null && best.ratio >= 2) strengths.push(`Their top video has ${best.ratio}× more views than the channel has subscribers (${best.views.toLocaleString()} views vs ${subs?.toLocaleString()} subs) — it reached far beyond the existing audience.`);
  if (uploadsPerWeek >= 3) strengths.push(`High output: ~${uploadsPerWeek} uploads per week across the sampled window.`);
  if (subs && metrics.medianViews >= subs * 0.3) strengths.push(`Consistent baseline: the median video gets ~${metrics.medianViews.toLocaleString()} views — close to the average of ${metrics.avgViews.toLocaleString()}, so performance isn't carried by one outlier alone.`);
  if (pillars.length >= 2) strengths.push(`Recognisable content pillars in the titles: ${pillars.map((p) => `"${p.label}" (${p.count} of ${n})`).join(", ")}.`);
  if (metrics.shortsPct >= 20 && metrics.shortsPct <= 80) strengths.push(`Mixed formats: ${metrics.shortsPct}% Shorts alongside long-form in the sample.`);

  for (const s of audit.signals) {
    if (s.score >= 40) weaknesses.push(`${s.label} (${s.score}/100): ${s.detail}`);
  }
  if (metrics.shortsPct === 100) weaknesses.push("The sample is 100% Shorts — no long-form videos, so no long watch-time content in the recent window.");
  if (metrics.shortsPct === 0 && metrics.avgLongDurationSec > 0) weaknesses.push("No Shorts in the sample — long-form only in the recent window.");
  if (uploadsPerWeek < 1) weaknesses.push(`Slow cadence in the sample: ~${uploadsPerWeek} uploads per week.`);
  if (subs && metrics.medianViews < subs * 0.05 && n >= 10) weaknesses.push(`Median views (${metrics.medianViews.toLocaleString()}) are under 5% of the subscriber count (${subs.toLocaleString()}) — most subscribers don't watch most uploads.`);
  if (!weaknesses.length) weaknesses.push("No signal crossed the reporting threshold in the sampled public data.");

  // ── Their risk fingerprints (from the audit of THIS channel) ─────────────
  const riskNotes: string[] = [];
  for (const s of audit.signals) {
    if (s.score >= 40) riskNotes.push(`${s.label} scores ${s.score}/100 on this channel — ${s.detail}`);
  }
  if (!riskNotes.length) riskNotes.push("No audit signal crossed 40/100 on this channel in the sampled window — its recent pattern reads comparatively varied.");
  riskNotes.push("These patterns are measurements of this channel's public data. Imitating another channel's exact titles, thumbnail layouts or description blocks is itself a reused-content risk factor, whoever does it.");

  const ageYears = channel.createdAt ? Math.round(((Date.now() - new Date(channel.createdAt).getTime()) / (365.25 * 86400000)) * 10) / 10 : null;

  return {
    channel: { title: channel.title, url: channel.url, subs, ageYears },
    metrics,
    risk: { score: audit.score, level: audit.level },
    pillars,
    topVideos,
    topOpenings,
    strengths,
    weaknesses,
    riskNotes,
  };
}
