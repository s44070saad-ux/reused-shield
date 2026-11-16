import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { ADMIN_EMAILS, PLANS } from "@/lib/config";
import { sendAlertEmail } from "@/lib/email";

export const runtime = "nodejs";

/**
 * Manual subscription requests. A signed-in user picks a paid plan and tells
 * us how to reach them; the request lands in /admin, where it is approved
 * (activating the plan) once payment has been arranged off-platform.
 * A best-effort email pings the admin inboxes — the admin panel is the
 * source of truth, email delivery is not guaranteed.
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Accounts are not configured on the server." }, { status: 500 });

  const sb = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData.user) return NextResponse.json({ error: "Your session expired. Sign in again." }, { status: 401 });
  const user = userData.user;

  const body = await req.json().catch(() => ({}));
  const plan = String(body.plan ?? "");
  const contact = String(body.contact ?? "").trim();
  const note = String(body.note ?? "").trim().slice(0, 500);
  const planDef = PLANS.find((p) => p.id === plan && !p.unavailable);
  if (!planDef || plan === "free") return NextResponse.json({ error: "Pick one of the paid plans." }, { status: 400 });
  if (!contact || contact.length > 200) return NextResponse.json({ error: "Tell us how to reach you (WhatsApp number or email)." }, { status: 400 });

  const { data: pending } = await sb
    .from("subscription_requests")
    .select("id, plan")
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1);
  if (pending && pending.length > 0) {
    return NextResponse.json({ error: "You already have a pending subscription request. We'll reach out on the contact you gave — write to us there if you need to change it." }, { status: 409 });
  }

  const { error } = await sb.from("subscription_requests").insert({ user_id: user.id, plan, contact, note: note || null });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort admin notification (never blocks the request).
  const text = [
    `New subscription request on Reused Content Shield`,
    ``,
    `Account: ${user.email ?? user.id}`,
    `Plan requested: ${planDef.name} — $${planDef.price}/month`,
    `Contact them at: ${contact}`,
    note ? `Their note: ${note}` : ``,
    ``,
    `Approve it from the admin panel once payment is arranged: https://reusedshield.vercel.app/admin`,
  ].filter(Boolean).join("\n");
  await Promise.allSettled(ADMIN_EMAILS.map((to) => sendAlertEmail(to, `New subscription request: ${planDef.name} ($${planDef.price}/mo)`, text)));

  return NextResponse.json({ ok: true });
}
