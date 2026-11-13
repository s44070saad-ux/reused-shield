// Channel Breakdown + "copy it with more value" plan.
// Everything is computed from PUBLIC metadata (titles, views, dates, durations,
// thumbnails) plus the same audit engine that scores reused-content risk.
// The plan copies the IDEA and the demand — never the channel's template
// fingerprints, which are exactly what carries their risk.
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
export interface FirstVideo { structure: string; basedOn: string; basedOnViews: number; beatNote: string }

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
  strengths: string[];
  weaknesses: string[];
  positioning: string[];
  firstVideos: FirstVideo[];
  production: string[];
  thirtyDay: { week: string; tasks: string[] }[];
  dontCopy: string[];
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export function skeletonize(title: string): string {
  return title
    .replace(/\$?\d[\d,]*(?:\.\d+)?%?/g, "N")
    .replace(/\s+/g, " ")
    .trim();
}

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
    .filter(([w, c]) => c >= 2 && !chanWords.has(w))
    .sort((a, b) => (b[0].includes(" ") ? 1 : 0) - (a[0].includes(" ") ? 1 : 0) || b[1] - a[1]);
  const pillars: Pillar[] = [];
  const usedTitles = new Set<string>();
  const coveredWords = new Set<string>();
  for (const [label] of candidates) {
    if (pillars.length >= 4) break;
    if (!label.includes(" ") && coveredWords.has(label)) continue; // unigram already inside a chosen phrase
    if (label.split(" ").some((w) => chanWords.has(w))) continue;
    const examples = videos
      .filter((v) => normalizeTitle(v.title).includes(label) && !usedTitles.has(v.id))
      .slice(0, 3);
    if (examples.length < 2) continue;
    examples.forEach((v) => usedTitles.add(v.id));
    label.split(" ").forEach((w) => coveredWords.add(w));
    pillars.push({ label, count: examples.length, examples: examples.map((v) => v.title) });
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

  // ── Strengths / weaknesses ───────────────────────────────────────────────
  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const best = topVideos[0];
  if (best?.ratio != null && best.ratio >= 2) strengths.push(`Breakout proof: their top video pulled ${best.ratio}× their subscriber count — the format can travel far beyond the existing audience.`);
  if (uploadsPerWeek >= 3) strengths.push(`Volume machine: ~${uploadsPerWeek} uploads/week keeps the algorithm fed and compounds catalogue views.`);
  if (subs && metrics.medianViews >= subs * 0.3) strengths.push(`Strong baseline: the median video gets ~${metrics.medianViews.toLocaleString()} views — loyal, returning demand, not one lucky hit.`);
  if (pillars.length >= 2) strengths.push(`Clear content pillars (${pillars.map((p) => `"${p.label}"`).join(", ")}) — viewers know exactly what the channel is for.`);
  if (metrics.shortsPct >= 20 && metrics.shortsPct <= 80) strengths.push("Healthy Shorts + long-form mix: Shorts for discovery, long videos for watch time.");

  for (const s of audit.signals) {
    if (s.score >= 40) weaknesses.push(`${s.label} (${s.score}/100): ${s.detail}`);
  }
  if (metrics.shortsPct === 100) weaknesses.push("All Shorts, no long-form: discovery without watch-time depth — a copy can own the long-form version of the same ideas.");
  if (metrics.shortsPct === 0 && metrics.avgLongDurationSec > 0) weaknesses.push("No Shorts at all: they're leaving free discovery on the table — clip the best moments as Shorts funnels.");
  if (uploadsPerWeek < 1) weaknesses.push(`Slow cadence (~${uploadsPerWeek}/week): consistent 3–4 uploads/week would out-publish them within a month.`);
  if (subs && metrics.medianViews < subs * 0.05 && n >= 10) weaknesses.push("Big subscriber-to-views gap: a large share of subs are dormant — proof the niche rewards fresh packaging over loyalty.");
  if (!weaknesses.length) weaknesses.push("No glaring public weaknesses in the sampled data — the opening has to come from a sharper angle and better execution, not their mistakes.");

  // ── Positioning: copy the idea, add value ────────────────────────────────
  const positioning: string[] = [
    `Same demand, sharper promise: keep the niche (${pillars[0] ? `"${pillars[0].label}"` : "their core topic"}) but name a specific viewer outcome in every title — a place, a number, a name, a twist they don't use.`,
    "Add one layer they don't have: original research, real data, maps/timelines, or first-hand testing — one verifiable extra per video is what separates 'original' from 'reused' in a review.",
    "Package differently on purpose: different thumbnail composition and title structure from theirs (see Don't Copy) so the channel reads as its own brand from video one.",
  ];
  if (metrics.shortsPct === 100) positioning.push("Own the long-form: turn their best Shorts topics into 8–12 minute deep versions — that's the watch-time territory they never claim.");
  if (metrics.shortsPct === 0) positioning.push("Add the Shorts funnel they skip: 30–45s cuts of each long video's best moment, posted between uploads.");

  // ── First videos: structures stolen, not titles ──────────────────────────
  const beatNotes = [
    "Beat it with a more specific angle: name the exact case/place/number in the title instead of the generic version.",
    "Beat it with proof: add one piece of original evidence (data, map, document, test) they didn't show.",
    "Beat it with a stronger hook: open on the most shocking moment/result in the first 15 seconds, not an intro.",
    "Beat it with a twist ending or a part-two promise that creates a series without repeating the same title formula.",
    "Beat it with production: cleaner voiceover pacing and on-screen text summaries every 30–45 seconds for retention.",
  ];
  const firstVideos: FirstVideo[] = topVideos.map((v, i) => ({
    structure: skeletonize(v.title),
    basedOn: v.title,
    basedOnViews: v.views,
    beatNote: beatNotes[i % beatNotes.length],
  }));

  // ── Production blueprint ─────────────────────────────────────────────────
  const targetLen = metrics.avgLongDurationSec
    ? `${Math.floor(metrics.avgLongDurationSec / 60)}–${Math.floor(metrics.avgLongDurationSec / 60) + 3} minutes`
    : "8–12 minutes";
  const production: string[] = [
    `Format: ${metrics.shortsPct >= 80 ? "Shorts-led (their catalogue is mostly ≤60s)" : metrics.shortsPct === 0 ? "Long-form only" : "Mixed Shorts + long-form"} — mirror the mix, not the exact templates.`,
    `Length: aim ${targetLen} for long videos (their long-form average), structured in chapters so retention holds.`,
    `Cadence: they post ~${uploadsPerWeek}/week. Match it or beat it by one — consistency beats bursts (bursts are also an audit signal).`,
    "Stack: original script written for the video (save it), licensed or human voiceover (keep the licence/receipt), stock/B-roll logged per video — all of it goes in the Provenance Vault so an appeal is pre-built.",
    "Before every upload: run the Pre-Publish Check with your title + thumbnail against YOUR channel so you don't drift into their template fingerprints.",
    "After every 5 uploads: run a fresh channel Audit and read the Since-last-audit diff — that's your steering wheel.",
  ];

  // ── 30-day plan ──────────────────────────────────────────────────────────
  const thirtyDay = [
    { week: "Week 1 — Setup & first proof", tasks: ["Create the channel with its own branding (name, banner, thumbnail style deliberately different from theirs).", `Produce video 1 from the strongest structure above ("${firstVideos[0]?.structure ?? "top structure"}").`, "Log script + voiceover licence + sources in the Provenance Vault from day one.", "Publish 2 videos; run Pre-Publish Check before each."] },
    { week: "Week 2 — Find your pillar", tasks: [`Publish 3 videos across the pillars (${pillars.map((p) => p.label).join(", ") || "their top topics"}).`, "Compare click and retention signals in your own analytics; double down on the pillar with the best first-48-hours views.", "Start the Shorts funnel if the plan calls for it — one cut per long video."] },
    { week: "Week 3 — Systematize without templating", tasks: ["Lock a repeatable production workflow (script → voice → edit → package) but rotate title structures and thumbnail compositions on purpose.", "Publish 3–4 videos; keep cadence steady — no bulk-upload days.", "Run your first channel Audit; fix anything it flags while the channel is young."] },
    { week: "Week 4 — Review & aim at monetization", tasks: ["Re-audit and read the diff: risk should be Low and trending down.", "Pick the best-performing pillar and plan a 4-video mini-series with varied titles (not Part 1–4 clones).", "Check YPP readiness honestly: subscribers + watch hours are the only gates left if the content pattern stays clean."] },
  ];

  // ── Don't copy (their risk is not your blueprint) ────────────────────────
  const dontCopy: string[] = [
    "Their exact title formulas and repeated openings — that repetition is precisely what reused-content review flags.",
    "Their thumbnail layouts: same composition + text placement across videos is a template fingerprint (their thumbnail-similarity audit signal is in the breakdown above).",
    "Their description boilerplate blocks, word for word.",
    ...audit.fixes.slice(0, 2).map((f) => `Fix-instead: ${f}`),
  ];

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
    positioning,
    firstVideos,
    production,
    thirtyDay,
    dontCopy,
  };
}
