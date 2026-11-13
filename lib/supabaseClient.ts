import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** Browser Supabase client (anon/publishable key only — never a service key). */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

export interface AuditVideo {
  id: string;
  title: string;
  publishedAt: string;
  durationSec: number;
  isShort: boolean;
  flags: string[];
}

export interface AuditSignal {
  key: string;
  label: string;
  score: number; // 0-100 contribution-weighted risk for this signal
  detail: string;
}

export interface Audit {
  id: string;
  user_id: string;
  channel_input: string;
  channel_id: string | null;
  channel_title: string | null;
  channel_url: string | null;
  subscriber_count: number | null;
  video_count_sampled: number;
  score: number;
  level: string;
  signals: AuditSignal[];
  reasons: string[];
  fixes: string[];
  videos: AuditVideo[];
  self_check: Record<string, string> | null;
  created_at: string;
}

export interface ProvenanceEntry {
  id: string;
  user_id: string;
  audit_id: string | null;
  video_ref: string;
  kind: string;
  title: string;
  detail: string | null;
  link: string | null;
  created_at: string;
}

export interface Deadline {
  id: string;
  user_id: string;
  channel_title: string;
  rejection_date: string;
  rejection_count: number;
  notes: string | null;
  created_at: string;
}

/** Deadline math for YouTube's clocks, computed from the rejection date. */
export function deadlineDates(d: Deadline) {
  const base = new Date(d.rejection_date + "T00:00:00Z");
  const add = (days: number) => {
    const x = new Date(base);
    x.setUTCDate(x.getUTCDate() + days);
    return x;
  };
  return {
    appealBy: add(21),
    reapplyBy: add(d.rejection_count <= 1 ? 30 : 90),
    reapplyDays: d.rejection_count <= 1 ? 30 : 90,
  };
}

export function daysLeft(target: Date) {
  const now = new Date();
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((b - a) / 86400000);
}
