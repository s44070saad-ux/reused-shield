// Shared monitoring core: re-audit a watched channel, compare with the last
// known score, raise an alert on a meaningful change, update the watch row.
// Used by the manual "Check now" route (user session client) and by the daily
// cron route (service-role client). Scores are RISK: higher = worse.
import type { SupabaseClient } from "@supabase/supabase-js";
import { getChannel, getRecentVideos } from "./youtube";
import { runAudit } from "./auditEngine";
import { sendAlertEmail } from "./email";

export interface WatchRow {
  id: string;
  user_id: string;
  channel_id: string;
  channel_title: string | null;
  channel_url: string | null;
  last_score: number | null;
  last_level: string | null;
  last_checked_at: string | null;
}

const LEVEL_ORDER: Record<string, number> = { Low: 0, Moderate: 1, High: 2, Critical: 3 };
export const ALERT_RISE = 10; // points of risk increase that trigger an alert
export const ALERT_DROP = 15; // points of risk decrease that trigger a good-news alert

export function alertFor(prevScore: number | null, prevLevel: string | null, newScore: number, newLevel: string, title: string): string | null {
  if (prevScore == null) return null;
  const delta = newScore - prevScore;
  const levelWorse = (LEVEL_ORDER[newLevel] ?? 0) > (LEVEL_ORDER[prevLevel ?? ""] ?? 0);
  if (delta >= ALERT_RISE || levelWorse) {
    return `Risk went UP for ${title}: ${prevScore} → ${newScore} (${newLevel}). Open the new report to see what changed.`;
  }
  if (delta <= -ALERT_DROP) {
    return `Good news — risk dropped for ${title}: ${prevScore} → ${newScore} (${newLevel}). The fixes are working.`;
  }
  return null;
}

export async function checkWatchedChannel(sb: SupabaseClient, w: WatchRow, notifyEmail?: string): Promise<{ score: number; level: string; alert: string | null; auditId: string; emailed: boolean }> {
  const input = w.channel_url ?? w.channel_id;
  const channel = await getChannel(input);
  const raw = await getRecentVideos(channel.uploadsPlaylist, 30);
  if (!raw.length) throw new Error(`No public videos found for ${w.channel_title ?? input}.`);
  const result = runAudit(raw);

  const { data: row, error } = await sb
    .from("audits")
    .insert({
      user_id: w.user_id,
      channel_input: input,
      channel_id: channel.id,
      channel_title: channel.title,
      channel_url: channel.url,
      subscriber_count: channel.subscriberCount,
      video_count_sampled: raw.length,
      score: result.score,
      level: result.level,
      signals: result.signals,
      reasons: result.reasons,
      fixes: result.fixes,
      videos: result.videos,
      self_check: null,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Audit save failed: ${error.message}`);

  const alert = alertFor(w.last_score, w.last_level, result.score, result.level, channel.title);
  let emailed = false;
  if (alert) {
    await sb.from("alerts").insert({
      user_id: w.user_id,
      watchlist_id: w.id,
      channel_title: channel.title,
      message: alert,
      prev_score: w.last_score,
      new_score: result.score,
      audit_id: row.id,
    });
    if (notifyEmail) {
      const bad = alert.startsWith("Risk went UP");
      emailed = await sendAlertEmail(
        notifyEmail,
        bad ? `⚠️ Risk alert: ${channel.title} is now ${result.score}/100` : `✅ Risk dropped: ${channel.title} is now ${result.score}/100`,
        `${alert}\n\nOpen the report: https://reusedshield.vercel.app/audit/${row.id}\n\n— Reused Content Shield monitoring`,
      );
    }
  }
  await sb.from("watchlist").update({
    channel_title: channel.title,
    channel_url: channel.url,
    last_score: result.score,
    last_level: result.level,
    last_checked_at: new Date().toISOString(),
  }).eq("id", w.id);

  return { score: result.score, level: result.level, alert, auditId: row.id, emailed };
}
