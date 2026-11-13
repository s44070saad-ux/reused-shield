import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getChannel, getRecentVideos, hashImageBuffer } from "@/lib/youtube";
import { checkPrePublish } from "@/lib/prepublish";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in first, then run the check." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 });

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const body = await req.json();
    const channelInput = String(body.channel_input ?? "").trim();
    const title = String(body.title ?? "").trim();
    const description = body.description ? String(body.description) : undefined;
    if (!channelInput) return NextResponse.json({ error: "Paste the channel this upload is for (URL, @handle or channel ID)." }, { status: 400 });
    if (title.length < 3) return NextResponse.json({ error: "Enter the planned title (at least a few characters)." }, { status: 400 });

    // Optional thumbnail: base64 (data URL or raw). Images are hashed, never stored.
    let thumbHash: string | null = null;
    if (body.thumbnail) {
      const raw = String(body.thumbnail).replace(/^data:image\/[a-zA-Z+.-]+;base64,/, "");
      const buf = Buffer.from(raw, "base64");
      if (buf.length > 6 * 1024 * 1024) return NextResponse.json({ error: "Thumbnail image is too large (max ~6 MB)." }, { status: 413 });
      if (buf.length) thumbHash = await hashImageBuffer(buf);
      if (!thumbHash) return NextResponse.json({ error: "That image could not be read. Try a JPG or PNG thumbnail." }, { status: 422 });
    }

    const channel = await getChannel(channelInput);
    const videos = await getRecentVideos(channel.uploadsPlaylist, 20);
    if (!videos.length) return NextResponse.json({ error: "That channel has no public videos to compare against yet." }, { status: 422 });

    const result = checkPrePublish({ title, description, thumbHash }, videos);

    const { data: row, error: insErr } = await sb
      .from("prepublish_checks")
      .insert({
        user_id: userData.user.id,
        channel_input: channelInput,
        channel_title: channel.title,
        title,
        overall: result.overall,
        verdict: result.verdict,
        detail: result,
      })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: `Check ran but could not be saved: ${insErr.message}` }, { status: 500 });

    return NextResponse.json({ id: row.id, channelTitle: channel.title, channelUrl: channel.url, result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "The check failed. Try again." }, { status: 500 });
  }
}
