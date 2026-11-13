// Pure scoring logic for the channel risk audit.
// Every signal is computed from PUBLIC YouTube metadata only.
// The output is a RISK ESTIMATE — never a prediction of YouTube's decision.

export interface RawVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  durationSec: number;
  thumbnailHash: string | null; // 64-bit average hash as hex, or null if fetch failed
}

export interface Signal {
  key: string;
  label: string;
  score: number;
  detail: string;
}

export interface EngineResult {
  score: number;
  level: "Low" | "Moderate" | "High" | "Critical";
  signals: Signal[];
  reasons: string[];
  fixes: string[];
  videos: { id: string; title: string; publishedAt: string; durationSec: number; isShort: boolean; flags: string[] }[];
}

const STOP = new Set(["the","a","an","of","to","in","on","for","and","or","vs","with","how","why","what","is","it","#shorts","shorts"]);

export function normalizeTitle(t: string): string {
  return t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function tokens(t: string): string[] {
  return normalizeTitle(t).split(" ").filter((w) => w && !STOP.has(w));
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach((x) => { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
}
function hammingHex(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

export function runAudit(videos: RawVideo[]): EngineResult {
  const n = videos.length;
  const signals: Signal[] = [];
  const reasons: string[] = [];
  const fixes: string[] = [];
  const perVideoFlags = new Map<string, string[]>();
  const flag = (id: string, f: string) => {
    const arr = perVideoFlags.get(id) ?? [];
    if (!arr.includes(f)) arr.push(f);
    perVideoFlags.set(id, arr);
  };

  // (a) Title template repetition
  const toks = videos.map((v) => new Set(tokens(v.title)));
  let similarPairs = 0, totalPairs = 0;
  const templatedIdx = new Set<number>();
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    totalPairs++;
    if (jaccard(toks[i], toks[j]) >= 0.55) { similarPairs++; templatedIdx.add(i); templatedIdx.add(j); }
  }
  // shared opening phrase (first 3 normalized words)
  const openings = new Map<string, number>();
  videos.forEach((v) => {
    const o = normalizeTitle(v.title).split(" ").slice(0, 3).join(" ");
    if (o) openings.set(o, (openings.get(o) ?? 0) + 1);
  });
  const biggestOpening = Math.max(0, ...openings.values());
  const templatePct = n ? Math.round((templatedIdx.size / n) * 100) : 0;
  const titleScore = Math.min(100, Math.round(templatePct * 0.8 + (totalPairs ? (similarPairs / totalPairs) * 40 : 0)));
  signals.push({ key: "titles", label: "Title template repetition", score: titleScore,
    detail: `${templatedIdx.size} of ${n} recent titles are highly similar to another title (${templatePct}%). Biggest shared opening phrase repeats ${biggestOpening} times.` });
  if (templatePct >= 40) { reasons.push(`${templatedIdx.size} of your last ${n} titles follow the same template — this is the classic "one formula" pattern reviewers flag.`); fixes.push("Rewrite titles so each one names something specific to that video (a name, place, number or event). Break the repeated opening phrase."); videos.forEach((v, i) => { if (templatedIdx.has(i)) flag(v.id, "Templated title"); }); }
  else if (templatePct >= 20) { reasons.push(`${templatePct}% of recent titles look templated. Vary them before it becomes a pattern.`); fixes.push("Vary title structure on the next uploads — mix questions, specifics and formats."); }

  // exact duplicate titles = re-upload pattern
  const seenTitles = new Map<string, string>();
  let dupTitles = 0;
  videos.forEach((v) => {
    const k = normalizeTitle(v.title);
    if (seenTitles.has(k)) { dupTitles++; flag(v.id, "Duplicate title (possible re-upload)"); }
    else seenTitles.set(k, v.id);
  });

  // (b) Description boilerplate ratio
  const lineCounts = new Map<string, number>();
  videos.forEach((v) => {
    const lines = new Set(v.description.split("\n").map((l) => l.trim()).filter((l) => l.length >= 12));
    lines.forEach((l) => lineCounts.set(l, (lineCounts.get(l) ?? 0) + 1));
  });
  const boilerLines = new Set([...lineCounts.entries()].filter(([, c]) => c >= Math.max(2, Math.ceil(n * 0.5))).map(([l]) => l));
  let totalChars = 0, boilerChars = 0;
  videos.forEach((v) => {
    totalChars += v.description.length;
    v.description.split("\n").forEach((l) => { if (boilerLines.has(l.trim())) boilerChars += l.length; });
  });
  const boilerPct = totalChars ? Math.round((boilerChars / totalChars) * 100) : 0;
  const boilerScore = Math.min(100, boilerPct);
  signals.push({ key: "descriptions", label: "Description boilerplate", score: boilerScore,
    detail: `${boilerPct}% of all description text is blocks repeated across half or more of the sampled videos.` });
  if (boilerPct >= 50) { reasons.push(`${boilerPct}% of your description text is copy-pasted boilerplate. Reviewers read this as mass-production.`); fixes.push("Write a unique 2–3 line description per video about what actually happens in it. Keep links/socials, but move them below the unique text."); }
  else if (boilerPct >= 30) { fixes.push("Trim repeated description blocks — add a unique paragraph per video above the standard links."); }

  // (c) Thumbnail similarity (perceptual hash)
  const hashed = videos.filter((v) => v.thumbnailHash);
  let thumbPairs = 0, thumbSimilar = 0;
  const thumbIdx = new Set<string>();
  for (let i = 0; i < hashed.length; i++) for (let j = i + 1; j < hashed.length; j++) {
    thumbPairs++;
    if (hammingHex(hashed[i].thumbnailHash!, hashed[j].thumbnailHash!) <= 8) { thumbSimilar++; thumbIdx.add(hashed[i].id); thumbIdx.add(hashed[j].id); }
  }
  const thumbPct = hashed.length ? Math.round((thumbIdx.size / hashed.length) * 100) : 0;
  const thumbScore = hashed.length ? Math.min(100, thumbPct) : 0;
  signals.push({ key: "thumbnails", label: "Thumbnail similarity", score: thumbScore,
    detail: hashed.length ? `${thumbIdx.size} of ${hashed.length} thumbnails are visually near-identical to another thumbnail (${thumbSimilar} similar pairs).` : "Thumbnails could not be fetched for hashing in this run." });
  if (thumbPct >= 40) { reasons.push(`${thumbIdx.size} of your recent thumbnails look near-identical — same layout, same background. That reads as templated output.`); fixes.push("Change thumbnail layouts: vary background, subject position and text placement per video; keep branding to a small corner mark."); thumbIdx.forEach((id) => flag(id, "Near-identical thumbnail")); }

  // (d) Upload cadence bursts
  const sorted = [...videos].sort((a, b) => +new Date(a.publishedAt) - +new Date(b.publishedAt));
  const perDay = new Map<string, number>();
  sorted.forEach((v) => { const d = v.publishedAt.slice(0, 10); perDay.set(d, (perDay.get(d) ?? 0) + 1); });
  const burstDays = [...perDay.entries()].filter(([, c]) => c >= 3);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push((+new Date(sorted[i].publishedAt) - +new Date(sorted[i - 1].publishedAt)) / 86400000);
  gaps.sort((a, b) => a - b);
  const medianGap = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
  const cadenceScore = Math.min(100, burstDays.length * 18 + (medianGap > 0 && medianGap < 0.5 ? 30 : medianGap < 1 ? 15 : 0));
  signals.push({ key: "cadence", label: "Upload cadence / bursts", score: cadenceScore,
    detail: `${burstDays.length} day(s) with 3+ uploads in the sample. Median gap between uploads: ${medianGap.toFixed(1)} days.` });
  if (burstDays.length) { reasons.push(`You uploaded 3+ videos on ${burstDays.length} day(s) — bulk-upload bursts are a mass-production signal.`); fixes.push("Space uploads out. If you batch-produce, schedule releases across days instead of publishing in bursts."); burstDays.forEach(([d]) => sorted.filter((v) => v.publishedAt.startsWith(d)).forEach((v) => flag(v.id, "Part of an upload burst"))); }

  // (e) Duration clustering
  const longs = videos.filter((v) => v.durationSec > 60);
  let clusterPct = 0;
  if (longs.length >= 4) {
    const ds = longs.map((v) => v.durationSec).sort((a, b) => a - b);
    const med = ds[Math.floor(ds.length / 2)];
    const inBand = longs.filter((v) => Math.abs(v.durationSec - med) / med <= 0.1).length;
    clusterPct = Math.round((inBand / longs.length) * 100);
  }
  const durationScore = Math.min(100, Math.max(0, clusterPct - 25));
  signals.push({ key: "duration", label: "Duration clustering", score: durationScore,
    detail: longs.length >= 4 ? `${clusterPct}% of long-form videos sit within ±10% of the median length — near-identical runtimes suggest a fixed template.` : "Not enough long-form videos in the sample to judge duration clustering." });
  if (clusterPct >= 60) { reasons.push(`${clusterPct}% of your long videos are almost the same length. Fixed runtimes are a template fingerprint.`); fixes.push("Let video length follow the content — cut or extend naturally instead of padding to a target length."); }

  // (f) Shorts mix + re-uploads
  const shorts = videos.filter((v) => v.durationSec > 0 && v.durationSec <= 60);
  const shortsPct = n ? Math.round((shorts.length / n) * 100) : 0;
  const mixScore = Math.min(100, dupTitles * 25 + (shortsPct === 100 ? 10 : 0));
  signals.push({ key: "mix", label: "Shorts mix & re-upload patterns", score: mixScore,
    detail: `${shorts.length} of ${n} sampled videos are Shorts (${shortsPct}%). ${dupTitles} exact duplicate title(s) found (possible re-uploads).` });
  if (dupTitles) { reasons.push(`${dupTitles} video(s) share an exact title with another upload — duplicate/re-uploaded content is named directly in the policy.`); fixes.push("Check the flagged duplicates: if a video is a re-upload with no new commentary or material change, it is your highest-risk content. Do not bulk-delete — see the cleanup caution below."); }

  const weights: Record<string, number> = { titles: 0.24, descriptions: 0.18, thumbnails: 0.22, cadence: 0.12, duration: 0.12, mix: 0.12 };
  const score = Math.round(signals.reduce((s, sig) => s + sig.score * (weights[sig.key] ?? 0.1), 0));
  const level = score >= 65 ? "Critical" : score >= 45 ? "High" : score >= 25 ? "Moderate" : "Low";

  fixes.push("Cleanup caution: if you remove videos, do it slowly (no more than ~10 per day) and remember deleted videos take their watch hours with them — deleting can drop you below the 4,000-hour threshold.");
  fixes.push("Start a Provenance Vault entry for every video you keep: script, voiceover source, project files. That evidence trail is what a strong appeal is built from.");

  return {
    score, level, signals, reasons, fixes,
    videos: videos.map((v) => ({ id: v.id, title: v.title, publishedAt: v.publishedAt, durationSec: v.durationSec, isShort: v.durationSec > 0 && v.durationSec <= 60, flags: perVideoFlags.get(v.id) ?? [] })),
  };
}
