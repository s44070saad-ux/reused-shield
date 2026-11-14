import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS } from "@/lib/config";

export const runtime = "nodejs";

/** Verify the caller is signed in AND on the admin list. Returns a service-role client when allowed. */
async function requireAdmin(req: NextRequest): Promise<{ svc: SupabaseClient; email: string } | { error: NextResponse }> {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) return { error: NextResponse.json({ error: "Supabase is not configured on the server." }, { status: 500 }) };
  if (!service) return { error: NextResponse.json({ error: "Admin is not configured yet (missing service key on the server)." }, { status: 500 }) };

  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return { error: NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 }) };

  const email = (data.user.email ?? "").toLowerCase();
  if (!ADMIN_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
    return { error: NextResponse.json({ error: "This area is for the site admin only." }, { status: 403 }) };
  }
  return { svc: createClient(url, service), email };
}

const dayMs = 86400000;
const within = (iso: string, days: number, now: number) => now - new Date(iso).getTime() < days * dayMs;

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const svc = gate.svc;
  const now = Date.now();

  try {
    const { data: usersData, error: usersErr } = await svc.auth.admin.listUsers({ page: 1, perPage: 500 });
    if (usersErr) throw new Error(usersErr.message);
    const users = usersData.users ?? [];

    const [{ data: audits, error: aErr }, { data: searches, error: sErr }, { data: waitlist, error: wErr }] = await Promise.all([
      svc.from("audits").select("id, user_id, channel_title, channel_input, score, level, video_count_sampled, created_at").order("created_at", { ascending: false }).limit(1000),
      svc.from("finder_searches").select("id, user_id, filters, results, created_at").order("created_at", { ascending: false }).limit(1000),
      svc.from("waitlist").select("id, email, channel_url, role, created_at").order("created_at", { ascending: false }).limit(200),
    ]);
    if (aErr) throw new Error(aErr.message);
    if (sErr) throw new Error(sErr.message);
    if (wErr) throw new Error(wErr.message);

    const auditRows = audits ?? [];
    const searchRows = searches ?? [];
    const waitRows = waitlist ?? [];

    const { data: profileRows } = await svc.from("profiles").select("user_id, plan");
    const planOf = new Map((profileRows ?? []).map((p: any) => [p.user_id, p.plan as string]));

    const byUser = new Map<string, { audits: number; searches: number; lastActive: string | null }>();
    const bump = (uid: string, kind: "audits" | "searches", iso: string) => {
      const cur = byUser.get(uid) ?? { audits: 0, searches: 0, lastActive: null };
      cur[kind] += 1;
      if (!cur.lastActive || iso > cur.lastActive) cur.lastActive = iso;
      byUser.set(uid, cur);
    };
    auditRows.forEach((a: any) => bump(a.user_id, "audits", a.created_at));
    searchRows.forEach((s: any) => bump(s.user_id, "searches", s.created_at));
    const emailOf = new Map(users.map((u) => [u.id, u.email ?? "(no email)"]));

    const levels = { Low: 0, Moderate: 0, High: 0, Critical: 0 } as Record<string, number>;
    auditRows.forEach((a: any) => { if (a.level in levels) levels[a.level] += 1; });

    return NextResponse.json({
      stats: {
        totalUsers: users.length,
        newUsers7d: users.filter((u) => u.created_at && within(u.created_at, 7, now)).length,
        totalAudits: auditRows.length,
        auditsToday: auditRows.filter((a: any) => within(a.created_at, 1, now)).length,
        audits7d: auditRows.filter((a: any) => within(a.created_at, 7, now)).length,
        totalSearches: searchRows.length,
        searchesToday: searchRows.filter((s: any) => within(s.created_at, 1, now)).length,
        searches7d: searchRows.filter((s: any) => within(s.created_at, 7, now)).length,
        waitlistCount: waitRows.length,
        levels,
      },
      users: users.map((u) => ({
        id: u.id,
        email: u.email ?? "(no email)",
        createdAt: u.created_at,
        lastSignInAt: (u as any).last_sign_in_at ?? null,
        audits: byUser.get(u.id)?.audits ?? 0,
        searches: byUser.get(u.id)?.searches ?? 0,
        lastActive: byUser.get(u.id)?.lastActive ?? null,
        plan: planOf.get(u.id) ?? "free",
        isAdmin: ADMIN_EMAILS.map((e) => e.toLowerCase()).includes((u.email ?? "").toLowerCase()),
      })),
      recentAudits: auditRows.slice(0, 25).map((a: any) => ({
        id: a.id, channel: a.channel_title ?? a.channel_input, score: a.score, level: a.level,
        videos: a.video_count_sampled, createdAt: a.created_at, ownerEmail: emailOf.get(a.user_id) ?? "(deleted user)",
      })),
      recentSearches: searchRows.slice(0, 25).map((s: any) => ({
        id: s.id, keyword: s.filters?.keyword ?? "", referenceTitle: s.filters?.referenceTitle ?? null,
        resultCount: Array.isArray(s.results) ? s.results.length : 0,
        createdAt: s.created_at, ownerEmail: emailOf.get(s.user_id) ?? "(deleted user)",
      })),
      waitlist: waitRows,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Admin data failed to load." }, { status: 500 });
  }
}

/** Set a user's plan. Body: { action: "set_plan", userId, plan } */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => ({}));
  if (body.action !== "set_plan") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  const userId = String(body.userId ?? "");
  const plan = String(body.plan ?? "");
  if (!userId || !["free", "solo", "pro", "agency"].includes(plan)) {
    return NextResponse.json({ error: "Missing userId or invalid plan." }, { status: 400 });
  }
  const { error } = await gate.svc.from("profiles").upsert({ user_id: userId, plan, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/** Delete one waitlist entry (spam cleanup). Body: { waitlistId } */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if ("error" in gate) return gate.error;
  const body = await req.json().catch(() => ({}));
  const id = String(body.waitlistId ?? "");
  if (!id) return NextResponse.json({ error: "Missing waitlistId." }, { status: 400 });
  const { error } = await gate.svc.from("waitlist").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
