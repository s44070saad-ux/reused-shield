// Compare two audits of the same channel: what improved, what got worse.
// Scores are RISK (lower = better). Flag comparison only covers videos that
// appear in BOTH samples — videos that rotated out of the recent window are
// not counted as "resolved".
import type { Audit } from "./supabaseClient";

export interface SignalDelta {
  key: string;
  label: string;
  before: number;
  after: number;
  delta: number; // after - before (negative = improved)
}

export interface FlagChange {
  videoId: string;
  videoTitle: string;
  flag: string;
}

export interface AuditDiff {
  scoreDelta: number;
  levelFrom: string;
  levelTo: string;
  signalDeltas: SignalDelta[];
  resolved: FlagChange[];
  added: FlagChange[];
  flaggedBefore: number; // videos with >=1 flag in the previous audit's sample
  flaggedAfter: number; // videos with >=1 flag in this audit's sample
  comparedVideos: number; // videos present in both samples
}

export function diffAudits(prev: Audit, curr: Audit): AuditDiff {
  const prevSignals = new Map((prev.signals ?? []).map((s) => [s.key, s]));
  const signalDeltas: SignalDelta[] = (curr.signals ?? []).map((s) => {
    const p = prevSignals.get(s.key);
    const before = p ? p.score : 0;
    return { key: s.key, label: s.label, before, after: s.score, delta: s.score - before };
  });

  const prevVids = new Map((prev.videos ?? []).map((v) => [v.id, v]));
  const resolved: FlagChange[] = [];
  const added: FlagChange[] = [];
  let compared = 0;
  for (const cv of curr.videos ?? []) {
    const pv = prevVids.get(cv.id);
    if (!pv) continue;
    compared++;
    const pFlags = new Set(pv.flags ?? []);
    const cFlags = new Set(cv.flags ?? []);
    pFlags.forEach((f) => { if (!cFlags.has(f)) resolved.push({ videoId: cv.id, videoTitle: cv.title, flag: f }); });
    cFlags.forEach((f) => { if (!pFlags.has(f)) added.push({ videoId: cv.id, videoTitle: cv.title, flag: f }); });
  }

  return {
    scoreDelta: curr.score - prev.score,
    levelFrom: prev.level,
    levelTo: curr.level,
    signalDeltas,
    resolved,
    added,
    flaggedBefore: (prev.videos ?? []).filter((v) => (v.flags ?? []).length > 0).length,
    flaggedAfter: (curr.videos ?? []).filter((v) => (v.flags ?? []).length > 0).length,
    comparedVideos: compared,
  };
}

/** Group audits by channel, oldest → newest within each group. */
export function groupByChannel(audits: Audit[]): Map<string, Audit[]> {
  const key = (a: Audit) => a.channel_id ?? a.channel_title ?? a.channel_input;
  const sorted = [...audits].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime());
  const out = new Map<string, Audit[]>();
  for (const a of sorted) {
    const k = key(a);
    const arr = out.get(k) ?? [];
    arr.push(a);
    out.set(k, arr);
  }
  return out;
}
