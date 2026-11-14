import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getChannel, getRecentVideos } from "@/lib/youtube";
import { runAudit } from "@/lib/auditEngine";
import { checkCredits, chargeCredits, outOfCreditsMessage } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in first, then run the audit." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 });

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const creditCheck = await checkCredits(sb, userData.user.id, "audit");
    if (!creditCheck.ok) return NextResponse.json({ error: outOfCreditsMessage(creditCheck, "audit") }, { status: 402 });

    const body = await req.json();
    const input = String(body.channel_input ?? "").trim();
    if (!input) return NextResponse.json({ error: "Paste a channel URL, @handle, or channel ID." }, { status: 400 });
    const selfCheck = (body.self_check ?? null) as Record<string, string> | null;

    const channel = await getChannel(input);
    const raw = await getRecentVideos(channel.uploadsPlaylist, 30);
    if (!raw.length) return NextResponse.json({ error: "That channel has no public videos to audit." }, { status: 422 });

    const result = runAudit(raw);

    const { data: row, error: insErr } = await sb
      .from("audits")
      .insert({
        user_id: userData.user.id,
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
        self_check: selfCheck,
      })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: `Audit ran but could not be saved: ${insErr.message}` }, { status: 500 });

    await chargeCredits(sb, userData.user.id, "audit");
    return NextResponse.json({ id: row.id, score: result.score, level: result.level });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Audit failed." }, { status: 500 });
  }
}
