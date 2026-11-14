import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { searchViralVideos, getReferenceSeed } from "@/lib/youtube";
import { applyFilters, finderKey, type FinderFilters } from "@/lib/finder";
import { checkCredits, chargeCredits, outOfCreditsMessage } from "@/lib/credits";

export const runtime = "nodejs";
export const maxDuration = 60;

const CACHE_HOURS = 24;

function num(v: any): number | undefined {
  const n = Number(v);
  return v === "" || v == null || Number.isNaN(n) || n < 0 ? undefined : n;
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return NextResponse.json({ error: "Sign in first, then use the Finder." }, { status: 401 });

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !anon) return NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 });

    const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
    const userId = userData.user.id;

    const body = await req.json();
    const referenceInput = String(body.referenceChannel ?? "").trim();
    let reference: { title: string; url: string; subs: number | null; keywords: string } | null = null;
    let referenceChannelId: string | undefined;
    if (referenceInput) {
      try {
        const seed = await getReferenceSeed(referenceInput);
        reference = { title: seed.title, url: seed.url, subs: seed.subs, keywords: seed.keywords };
        referenceChannelId = seed.channelId;
      } catch (e: any) {
        return NextResponse.json({ error: `Reference channel problem: ${e?.message ?? "could not read that channel."}` }, { status: 400 });
      }
    }
    const filters: FinderFilters = {
      keyword: String(body.keyword ?? "").trim() || reference?.keywords || "",
      language: /^[a-z]{2}$/.test(String(body.language ?? "")) ? String(body.language) : undefined,
      referenceChannel: referenceChannelId,
      dateFrom: body.dateFrom || undefined,
      dateTo: body.dateTo || undefined,
      type: ["shorts", "long", "long8"].includes(body.type) ? body.type : "all",
      minViews: num(body.minViews),
      maxViews: num(body.maxViews),
      minSubs: num(body.minSubs),
      maxSubs: num(body.maxSubs),
      maxChannelAgeYears: num(body.maxChannelAgeYears),
      facelessOnly: Boolean(body.facelessOnly),
    };
    if (!filters.keyword) return NextResponse.json({ error: "Enter a niche keyword — or paste a reference channel and I'll derive the niche from its recent videos." }, { status: 400 });
    if (filters.keyword.length > 100) return NextResponse.json({ error: "Keyword is too long." }, { status: 400 });

    const queryKey = finderKey(filters);

    // 24h cache: identical search by the same user returns instantly and costs 0 quota.
    const since = new Date(Date.now() - CACHE_HOURS * 3600000).toISOString();
    const { data: cached } = await sb
      .from("finder_searches")
      .select("id, results, created_at")
      .eq("user_id", userId)
      .eq("query_key", queryKey)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1);
    if (cached && cached.length) {
      return NextResponse.json({ id: cached[0].id, results: cached[0].results, cached: true, reference });
    }

    // Global cache: if ANY user ran the identical search in the last 24h, the
    // results (public YouTube data) are reused — 0 quota, 0 credits. This is
    // the single biggest saver on the shared daily quota. Read via service
    // role because RLS only lets users see their own searches.
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (serviceKey) {
      const svc = createClient(url, serviceKey);
      const { data: globalCached } = await svc
        .from("finder_searches")
        .select("id, results")
        .eq("query_key", queryKey)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(1);
      if (globalCached && globalCached.length) {
        return NextResponse.json({ id: globalCached[0].id, results: globalCached[0].results, cached: true, reference });
      }
    }

    // Credits: a fresh search costs CREDIT_COSTS.finder (cached repeats are free, handled above).
    const creditCheck = await checkCredits(sb, userId, "finder");
    if (!creditCheck.ok) return NextResponse.json({ error: outOfCreditsMessage(creditCheck, "finder") }, { status: 402 });

    // Daily cap on fresh searches per plan (protects the shared 10,000-unit daily quota).
    const dailyLimit = creditCheck.plan.finderDaily;
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count } = await sb
      .from("finder_searches")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", dayStart.toISOString());
    if ((count ?? 0) >= dailyLimit) {
      return NextResponse.json({ error: `Daily Finder limit reached (${dailyLimit} fresh searches/day on the ${creditCheck.plan.name} plan — YouTube search quota is shared by all users). Your earlier searches today are still in your history below, and identical repeats are free.` }, { status: 429 });
    }

    const { videos, channels } = await searchViralVideos(filters);
    const results = applyFilters(videos, channels, filters);

    const savedFilters = reference ? { ...filters, referenceTitle: reference.title, referenceUrl: reference.url, seedKeywords: reference.keywords } : filters;
    const { data: row, error: insErr } = await sb
      .from("finder_searches")
      .insert({ user_id: userId, query_key: queryKey, filters: savedFilters, results })
      .select("id")
      .single();
    if (insErr) return NextResponse.json({ error: `Search ran but could not be saved: ${insErr.message}` }, { status: 500 });

    await chargeCredits(sb, userId, "finder");
    return NextResponse.json({ id: row.id, results, cached: false, reference });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Finder search failed." }, { status: 500 });
  }
}
