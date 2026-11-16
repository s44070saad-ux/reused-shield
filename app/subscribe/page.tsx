"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_NAME, PLANS, planById } from "@/lib/config";
import type { Session } from "@supabase/supabase-js";

interface SubRequest { id: string; plan: string; contact: string; note: string | null; status: string; created_at: string }

const PAID_PLANS = PLANS.filter((p) => !p.unavailable);

export default function SubscribePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPlan, setCurrentPlan] = useState("free");
  const [requests, setRequests] = useState<SubRequest[]>([]);
  const [plan, setPlan] = useState("pro");
  const [contact, setContact] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const [{ data: prof }, { data: reqs }] = await Promise.all([
      supabase.from("profiles").select("plan").single(),
      supabase.from("subscription_requests").select("*").order("created_at", { ascending: false }).limit(5),
    ]);
    if (prof?.plan) setCurrentPlan(prof.plan as string);
    if (reqs) setRequests(reqs as SubRequest[]);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setSession(data.session);
      if (data.session.user.email) setContact(data.session.user.email);
      await load();
      setLoading(false);
    });
  }, [router, load]);

  const pending = requests.find((r) => r.status === "pending");
  const current = planById(currentPlan);
  const hasPaid = !current.unavailable && currentPlan !== "free";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSending(true); setErr("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ plan, contact, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not send the request.");
      setSent(true);
      await load();
    } catch (e2: any) {
      setErr(e2.message ?? "Could not send the request.");
    }
    setSending(false);
  }

  if (loading) return <main className="wrap"><p className="muted" style={{ paddingTop: 40 }}>Loading…</p></main>;
  if (!supabase) return <main className="wrap"><div className="card"><p className="err">Accounts are not connected yet. Please check back shortly.</p></div></main>;

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/dashboard">← Dashboard</Link>
        <span className="chip">Subscribe</span>
      </div>

      <section className="page-head">
        <h1>Subscribe to {PRODUCT_NAME}</h1>
        <p>
          Subscriptions are activated <b>manually</b> for now — no card checkout, nothing charged automatically.
          Pick a plan, send the request, and we reply on your contact with payment instructions.
          Your plan switches on as soon as payment lands — usually the same day.
        </p>
      </section>

      {hasPaid && (
        <div className="card" style={{ borderColor: "#18A999" }}>
          <b>Your current plan: {current.name} · ${current.price}/month</b>
          <p className="muted" style={{ margin: "6px 0 0" }}>You can still request a different plan below — it replaces your current one when approved.</p>
        </div>
      )}

      {pending ? (
        <div className="card" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
          <h3 style={{ marginTop: 0 }}>Request sent — {planById(pending.plan).name} (${planById(pending.plan).price}/month)</h3>
          <p style={{ margin: 0 }}>
            Sent {new Date(pending.created_at).toLocaleString()} · we'll reach you at <b>{pending.contact}</b> with payment instructions.
            Nothing is active (or charged) until you pay and we approve it here. If you need to change the plan or contact, reply when we message you.
          </p>
        </div>
      ) : (
        <div className="card">
          <form onSubmit={submit}>
            <div className="grid">
              {PAID_PLANS.map((p) => (
                <label key={p.id} className="card feature" style={{ marginTop: 0, cursor: "pointer", ...(plan === p.id ? { borderColor: "#18A999", borderWidth: 2 } : {}) }}>
                  <input type="radio" name="plan" value={p.id} checked={plan === p.id} onChange={() => setPlan(p.id)} style={{ width: 20, height: 20 }} />{" "}
                  <b style={{ fontSize: "1.05rem" }}>{p.name}</b> {p.id === "pro" && <span className="chip" style={{ background: "#18A999", color: "#fff", borderColor: "#18A999" }}>MOST POPULAR</span>}
                  <p style={{ margin: "6px 0" }}><b style={{ fontSize: "1.4rem", color: "#142D4C" }}>${p.price}</b><span className="muted"> /month</span></p>
                  <p className="muted" style={{ margin: 0 }}>{p.monthlyCredits} credits/month · watch {p.watchLimit} channels</p>
                </label>
              ))}
            </div>
            <div className="field" style={{ marginTop: 16 }}>
              <label htmlFor="s-contact">How should we reach you?</label>
              <input id="s-contact" className="field-input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="WhatsApp number (with country code) or email" required />
              <p className="muted" style={{ margin: "6px 0 0", fontSize: ".88rem" }}>We send payment instructions here and confirm when your plan is active. Nothing else — no spam, no sharing.</p>
            </div>
            <div className="field">
              <label htmlFor="s-note">Anything we should know? <span className="muted">(optional)</span></label>
              <input id="s-note" className="field-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I run 3 faceless channels, paying from Pakistan" />
            </div>
            {err && <p className="err">{err}</p>}
            {sent && <p style={{ color: "#15803d" }}><b>Request sent.</b> We'll be in touch on your contact shortly.</p>}
            <button className="btn" type="submit" disabled={sending}>{sending ? "Sending…" : `Request ${planById(plan).name} — $${planById(plan).price}/month`}</button>
          </form>
        </div>
      )}

      {requests.length > 0 && (
        <>
          <h2>Your requests</h2>
          <div className="grid">
            {requests.map((r) => (
              <div className="card" key={r.id} style={{ marginTop: 0, padding: "14px 18px" }}>
                <b>{planById(r.plan).name}</b> · ${planById(r.plan).price}/month{" "}
                <span className="chip" style={r.status === "approved" ? { background: "#dcfce7", borderColor: "#86efac" } : r.status === "rejected" ? { background: "#fee2e2", borderColor: "#fca5a5" } : { background: "#fef3c7", borderColor: "#fcd34d" }}>{r.status}</span>
                <br />
                <span className="muted" style={{ fontSize: ".88rem" }}>{new Date(r.created_at).toLocaleString()} · contact: {r.contact}{r.note ? ` · “${r.note}”` : ""}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="honesty">
        Manual activation means a human checks every request. If we can't reach you on the contact you gave, the request simply stays pending — you're never charged for anything you didn't agree to pay for off-platform.
      </div>
    </main>
  );
}
