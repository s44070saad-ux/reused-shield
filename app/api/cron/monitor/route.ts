import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkWatchedChannel, type WatchRow } from "@/lib/monitorCore";

export const runtime = "nodejs";
export const maxDuration = 300;

// Daily scheduled re-audit of watched channels (Vercel Cron → vercel.json).
// Guarded by CRON_SECRET: Vercel sends "Authorization: Bearer <CRON_SECRET>".
// Runs as service role so it can audit on behalf of every watching user.
const MAX_PER_RUN = 25;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set." }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) return NextResponse.json({ error: "Service role is not configured." }, { status: 500 });

  const sb = createClient(url, service);
  const { data, error } = await sb
    .from("watchlist")
    .select("*")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(MAX_PER_RUN);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let checked = 0;
  let alerts = 0;
  let emailed = 0;
  const failures: string[] = [];
  const emailByUser = new Map<string, string | undefined>();
  for (const w of (data ?? []) as WatchRow[]) {
    try {
      if (!emailByUser.has(w.user_id)) {
        const { data: u } = await sb.auth.admin.getUserById(w.user_id);
        emailByUser.set(w.user_id, u.user?.email ?? undefined);
      }
      const r = await checkWatchedChannel(sb, w, emailByUser.get(w.user_id));
      checked++;
      if (r.alert) alerts++;
      if (r.emailed) emailed++;
    } catch (e: any) {
      failures.push(`${w.channel_title ?? w.channel_id}: ${e?.message ?? "failed"}`);
    }
  }
  return NextResponse.json({ checked, alerts, emailed, failures });
}
