import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { checkWatchedChannel, type WatchRow } from "@/lib/monitorCore";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Manual "Check now" for one watched channel (owner session required). */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 });

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });

    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) return NextResponse.json({ error: "Missing watchlist id." }, { status: 400 });

    const { data: w, error: wErr } = await sb.from("watchlist").select("*").eq("id", id).single();
    if (wErr || !w) return NextResponse.json({ error: "Watch entry not found." }, { status: 404 });

    const result = await checkWatchedChannel(sb, w as WatchRow, userData.user.email ?? undefined);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Check failed. Try again." }, { status: 500 });
  }
}
