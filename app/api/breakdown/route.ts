import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getChannel, getBreakdownVideos } from "@/lib/youtube";
import { buildBreakdown } from "@/lib/breakdown";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in first, then create a breakdown." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 });

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const body = await req.json();
    const input = String(body.channel ?? "").trim();
    if (!input) return NextResponse.json({ error: "Missing channel." }, { status: 400 });

    const channel = await getChannel(input);
    const videos = await getBreakdownVideos(channel.uploadsPlaylist, 30);
    if (!videos.length) return NextResponse.json({ error: "That channel has no public videos to break down." }, { status: 422 });

    const plan = buildBreakdown(
      { id: channel.id, title: channel.title, url: channel.url, subs: channel.subscriberCount, createdAt: channel.createdAt },
      videos,
    );

    const { data: row, error: insErr } = await sb
      .from("breakdowns")
      .insert({ user_id: userData.user.id, channel_id: channel.id, channel_title: channel.title, channel_url: channel.url, plan })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: `Breakdown built but could not be saved: ${insErr.message}` }, { status: 500 });

    return NextResponse.json({ id: row.id, plan });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "The breakdown failed. Try again." }, { status: 500 });
  }
}
