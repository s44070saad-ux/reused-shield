// Pre-Publish Check: score a PLANNED upload against the channel's own recent
// patterns before it goes live. Same public-signal logic as the audit engine —
// the output is a SAMENESS estimate, never a prediction of YouTube's decision.
import { normalizeTitle, titleTokens, jaccard, hammingHex, type RawVideo } from "./auditEngine";

export interface PartScore {
  key: "title" | "thumbnail" | "description";
  label: string;
  score: number; // 0-100 sameness (higher = more templated)
  detail: string;
}

export interface PrePublishResult {
  overall: number;
  verdict: string;
  parts: PartScore[];
  warnings: string[];
  fixes: string[];
  comparedVideos: number;
  closestTitle: { title: string; similarity: number } | null;
  closestThumbDistance: number | null;
}

const opening = (t: string) => normalizeTitle(t).split(" ").slice(0, 3).join(" ");

export function checkPrePublish(
  planned: { title: string; description?: string; thumbHash?: string | null },
  videos: RawVideo[],
): PrePublishResult {
  const warnings: string[] = [];
  const fixes: string[] = [];
  const parts: PartScore[] = [];
  const n = videos.length;

  // ── Title ────────────────────────────────────────────────────────────────
  const pToks = new Set(titleTokens(planned.title));
  const pNorm = normalizeTitle(planned.title);
  let maxJac = 0;
  let closestTitle: PrePublishResult["closestTitle"] = null;
  let similarCount = 0;
  let exactDup: string | null = null;
  let openingHits = 0;
  const pOpen = opening(planned.title);
  for (const v of videos) {
    const j = jaccard(pToks, new Set(titleTokens(v.title)));
    if (j > maxJac) { maxJac = j; closestTitle = { title: v.title, similarity: Math.round(j * 100) }; }
    if (j >= 0.55) similarCount++;
    if (normalizeTitle(v.title) === pNorm) exactDup = v.title;
    if (pOpen && opening(v.title) === pOpen) openingHits++;
  }
  let titleScore = Math.round(maxJac * 60 + (n ? similarCount / n : 0) * 40);
  if (exactDup) titleScore = 100;
  titleScore = Math.min(100, titleScore);
  let titleDetail = n
    ? `Closest past title is ${Math.round(maxJac * 100)}% similar in wording; ${similarCount} of ${n} recent titles are highly similar to it.`
    : "No past videos to compare against.";
  if (exactDup) { titleDetail = `This title is IDENTICAL to an existing video: "${exactDup}".`; warnings.push("Exact duplicate title — this is a re-upload pattern."); fixes.push("Never reuse an exact title. Name something specific to THIS video."); }
  else if (similarCount >= 3) { warnings.push(`Your planned title is highly similar to ${similarCount} of your last ${n} titles.`); fixes.push("Break the pattern: change the structure, not just the variable word — lead with a specific name, place, number or question."); }
  if (openingHits >= 3 && !exactDup) { warnings.push(`The opening "${pOpen}…" already starts ${openingHits} of your recent titles.`); fixes.push("Change the first three words — repeated openings are the clearest template fingerprint."); }
  if (titleScore < 35 && n) fixes.push("Title looks fresh against your recent uploads. Keep it that way.");
  parts.push({ key: "title", label: "Title sameness", score: titleScore, detail: titleDetail });

  // ── Thumbnail ────────────────────────────────────────────────────────────
  let closestThumbDistance: number | null = null;
  if (planned.thumbHash) {
    const hashed = videos.filter((v) => v.thumbnailHash);
    let minD = Infinity;
    let nearCount = 0;
    for (const v of hashed) {
      const dist = hammingHex(planned.thumbHash, v.thumbnailHash!);
      if (dist < minD) minD = dist;
      if (dist <= 8) nearCount++;
    }
    if (hashed.length) {
      closestThumbDistance = minD;
      const thumbScore = minD === 0 ? 100 : minD <= 4 ? 92 : minD <= 8 ? 78 : minD <= 12 ? 48 : minD <= 16 ? 26 : 10;
      let detail = `Nearest past thumbnail is at distance ${minD}/64 (≤8 counts as near-identical). ${nearCount} of ${hashed.length} recent thumbnails are near-identical to this layout.`;
      if (minD <= 8) { warnings.push("This thumbnail's layout is near-identical to thumbnails you've already published."); fixes.push("Change the composition: move the subject, change the background colour family, reduce or reposition the text block."); }
      else if (minD <= 12) { warnings.push("Thumbnail is somewhat close to your recent layouts."); fixes.push("A different background or subject position would separate it from your recent uploads."); }
      parts.push({ key: "thumbnail", label: "Thumbnail sameness", score: Math.min(100, thumbScore + (nearCount >= 5 ? 8 : 0)), detail });
    }
  }

  // ── Description ──────────────────────────────────────────────────────────
  if (planned.description && planned.description.trim().length >= 20) {
    const plannedLines = new Set(planned.description.split("\n").map((l) => normalizeTitle(l)).filter((l) => l.length >= 12));
    const pastLines = new Set<string>();
    for (const v of videos) (v.description ?? "").split("\n").forEach((l) => { const x = normalizeTitle(l); if (x.length >= 12) pastLines.add(x); });
    if (plannedLines.size && pastLines.size) {
      let reuse = 0;
      plannedLines.forEach((l) => { if (pastLines.has(l)) reuse++; });
      const reusePct = Math.round((reuse / plannedLines.size) * 100);
      const descScore = Math.round(reusePct * 0.8);
      let detail = `${reusePct}% of this description's lines already appear in your past descriptions (${reuse} of ${plannedLines.size} lines).`;
      if (reusePct >= 60) { warnings.push("Most of this description is copy-pasted boilerplate from past videos."); fixes.push("Write the first 2–3 lines fresh for THIS video (what happens, what's new). Keep links/socials at the bottom — those are fine."); }
      else if (reusePct >= 35) fixes.push("Personalize the top of the description for this video; the reused block lower down matters less.");
      parts.push({ key: "description", label: "Description reuse", score: descScore, detail });
    }
  }

  // ── Overall ──────────────────────────────────────────────────────────────
  const weights: Record<string, number> = { title: 0.45, thumbnail: 0.4, description: 0.15 };
  let wSum = 0, acc = 0;
  for (const p of parts) { acc += p.score * weights[p.key]; wSum += weights[p.key]; }
  const overall = wSum ? Math.round(acc / wSum) : 0;
  const verdict = exactDup || overall >= 75
    ? "Don't publish as-is — this reads as another copy of your template."
    : overall >= 55
      ? "Too close to your pattern — revise before publishing."
      : overall >= 30
        ? "Some sameness — a few changes would separate it."
        : "Looks fresh against your recent uploads.";

  return { overall, verdict, parts, warnings, fixes, comparedVideos: n, closestTitle, closestThumbDistance };
}
