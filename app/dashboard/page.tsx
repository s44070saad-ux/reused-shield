"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, type Audit, type Deadline, type WatchItem, type AlertItem, deadlineDates, daysLeft } from "@/lib/supabaseClient";
import { SELF_CHECK_QUESTIONS } from "@/lib/selfCheck";
import { groupByChannel } from "@/lib/auditDiff";
import { PRODUCT_NAME, HONESTY_NOTE, ADMIN_EMAILS, planById, CREDIT_COSTS, SIGNUP_BONUS_CREDITS, SIGNUP_BONUS_DAYS } from "@/lib/config";
import type { Session } from "@supabase/supabase-js";

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [watchlist, setWatchlist] = useState<WatchItem[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [planId, setPlanId] = useState("free");
  const [planCreatedAt, setPlanCreatedAt] = useState<string | null>(null);
  const [creditsUsed, setCreditsUsed] = useState(0);
  const [watchInput, setWatchInput] = useState("");
  const [checkingId, setCheckingId] = useState("");
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [channel, setChannel] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [dl, setDl] = useState({ channel_title: "", rejection_date: "", rejection_count: 1, notes: "" });
  const [dlMsg, setDlMsg] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const [a, d, w, al] = await Promise.all([
      supabase.from("audits").select("*").order("created_at", { ascending: false }),
      supabase.from("deadlines").select("*").order("rejection_date", { ascending: false }),
      supabase.from("watchlist").select("*").order("created_at", { ascending: false }),
      supabase.from("alerts").select("*").order("created_at", { ascending: false }).limit(10),
    ]);
    if (a.data) setAudits(a.data as Audit[]);
    if (d.data) setDeadlines(d.data as Deadline[]);
    if (w.data) setWatchlist(w.data as WatchItem[]);
    if (al.data) setAlerts(al.data as AlertItem[]);
    const prof = await supabase.from("profiles").select("plan, created_at").maybeSingle();
    if (prof.data) { setPlanId(prof.data.plan ?? "free"); setPlanCreatedAt(prof.data.created_at ?? null); }
    else {
      const u = await supabase.auth.getUser();
      if (u.data.user) { await supabase.from("profiles").insert({ user_id: u.data.user.id, plan: "free" }); setPlanCreatedAt(new Date().toISOString()); }
    }
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const usage = await supabase.from("usage_events").select("cost").gte("created_at", monthStart);
    if (usage.data) setCreditsUsed(usage.data.reduce((s: number, r: any) => s + (r.cost ?? 0), 0));
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setSession(data.session);
      const prefill = new URLSearchParams(window.location.search).get("channel");
      if (prefill) setChannel(prefill);
      await load();
      setLoading(false);
    });
  }, [router, load]);

  async function runAudit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setRunning(true); setErr("");
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ channel_input: channel.trim(), self_check: Object.keys(answers).length ? answers : null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Audit failed.");
      router.push(`/audit/${data.id}`);
    } catch (e2: any) {
      setErr(e2.message ?? "Audit failed.");
      setRunning(false);
    }
  }

  const watchedIds = new Set(watchlist.map((w) => w.channel_id));

  async function insertWatch(a: Audit) {
    if (!supabase || !session || !a.channel_id) return;
    if (watchedIds.has(a.channel_id)) { setErr("That channel is already on your watchlist."); return; }
    const myPlan = planById(planId);
    if (myPlan.watchLimit === 0) { setErr("Channel monitoring is a paid feature — upgrade to Solo, Pro or Agency to watch channels."); return; }
    if (watchlist.length >= myPlan.watchLimit) { setErr(`Your ${myPlan.name} plan watches up to ${myPlan.watchLimit} channels. Remove one or upgrade.`); return; }
    const { error } = await supabase.from("watchlist").insert({
      user_id: session.user.id, channel_id: a.channel_id, channel_title: a.channel_title,
      channel_url: a.channel_url, last_score: a.score, last_level: a.level, last_checked_at: a.created_at,
    });
    if (error) { setErr(error.message); return; }
    load();
  }

  async function addToWatch(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !watchInput.trim()) return;
    const myPlan = planById(planId);
    if (myPlan.watchLimit === 0) { setErr("Channel monitoring is a paid feature — upgrade to Solo, Pro or Agency to watch channels."); return; }
    if (watchlist.length >= myPlan.watchLimit) { setErr(`Your ${myPlan.name} plan watches up to ${myPlan.watchLimit} channels. Remove one or upgrade.`); return; }
    setErr("");
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ channel_input: watchInput.trim(), self_check: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not audit that channel.");
      if (!supabase) return;
      const { data: row } = await supabase.from("audits").select("*").eq("id", data.id).single();
      if (row) { await insertWatch(row as Audit); setWatchInput(""); }
      load();
    } catch (e2: any) {
      setErr(e2.message ?? "Could not add that channel.");
    }
  }

  async function checkNow(w: WatchItem) {
    if (!session) return;
    setCheckingId(w.id); setErr("");
    try {
      const res = await fetch("/api/watchlist/check", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ id: w.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Check failed.");
      await load();
    } catch (e2: any) {
      setErr(e2.message ?? "Check failed.");
    }
    setCheckingId("");
  }

  async function removeWatch(id: string) {
    if (!supabase) return;
    await supabase.from("watchlist").delete().eq("id", id);
    load();
  }

  async function markAlertsRead() {
    if (!supabase) return;
    await supabase.from("alerts").update({ read: true }).eq("read", false);
    load();
  }

  async function addDeadline(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !session) return;
    const { error } = await supabase.from("deadlines").insert({
      user_id: session.user.id, channel_title: dl.channel_title.trim(),
      rejection_date: dl.rejection_date, rejection_count: dl.rejection_count, notes: dl.notes.trim() || null,
    });
    if (error) { setDlMsg(error.message); return; }
    setDl({ channel_title: "", rejection_date: "", rejection_count: 1, notes: "" });
    setDlMsg("");
    load();
  }

  async function removeDeadline(id: string) {
    if (!supabase) return;
    await supabase.from("deadlines").delete().eq("id", id);
    load();
  }

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/");
  }

  if (loading) return <main className="wrap"><p className="muted" style={{ paddingTop: 40 }}>Loading…</p></main>;
  if (!supabase) return <main className="wrap"><div className="card"><p className="err">Accounts are not connected yet. Please check back shortly.</p></div></main>;

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/"><svg className="yt-mark" width="32" height="23" viewBox="0 0 30 21" aria-hidden="true"><rect width="30" height="21" rx="5" fill="#FF0033"/><path d="M12.2 6.4l7 4.1-7 4.1z" fill="#fff"/></svg>{PRODUCT_NAME.replace(/ Shield$/, "")} <span>Shield</span></Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-sm" href="/finder">Viral Content Finder</Link>
          <Link className="btn btn-ghost btn-sm" href="/prepublish">Pre-Publish Check</Link>
          {session && ADMIN_EMAILS.includes((session.user.email ?? "").toLowerCase()) && (
            <Link className="btn btn-ghost btn-sm" href="/admin">Admin</Link>
          )}
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <section className="page-head">
        <h1>Your channels</h1>
        <p>Every audit you've run, your rejection clocks, and your provenance evidence — in one place.</p>
      </section>

      {alerts.some((a) => !a.read) && (
        <div className="card" style={{ borderColor: "#f59e0b", background: "#fffbeb" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <h3 style={{ margin: 0 }}>🔔 Monitoring alerts</h3>
            <button className="btn btn-ghost btn-sm" onClick={markAlertsRead}>Mark all read</button>
          </div>
          <ul style={{ margin: "10px 0 0", paddingLeft: 20 }}>
            {alerts.filter((a) => !a.read).map((a) => (
              <li key={a.id} style={{ marginBottom: 6 }}>
                {a.message}{" "}
                {a.audit_id && <Link href={`/audit/${a.audit_id}`}>View report</Link>}
                <span className="muted"> · {new Date(a.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(() => {
        const plan = planById(planId);
        const bonusActive = planCreatedAt == null || Date.now() - new Date(planCreatedAt).getTime() < SIGNUP_BONUS_DAYS * 86400000;
        const allowance = plan.monthlyCredits + (bonusActive ? SIGNUP_BONUS_CREDITS : 0);
        const left = Math.max(0, allowance - creditsUsed);
        const pct = Math.min(100, Math.round((creditsUsed / allowance) * 100));
        return (
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Your plan: {plan.name}{plan.price > 0 && <span className="muted" style={{ fontWeight: 400 }}> · ${plan.price}/month</span>}</h3>
              <a className="btn btn-ghost btn-sm" href="/#pricing">See plans</a>
            </div>
            <div className="bar" style={{ marginTop: 12 }}><div style={{ width: `${pct}%`, background: left === 0 ? "#dc2626" : undefined }} /></div>
            <p className="muted" style={{ margin: "8px 0 0" }}>
              <b style={{ color: "#142D4C" }}>{left} of {allowance} credits left</b> this month ({creditsUsed} used · resets on the 1st).
              {bonusActive && <> Includes your <b>+{SIGNUP_BONUS_CREDITS} signup bonus</b> (first {SIGNUP_BONUS_DAYS} days).</>}
              {" "}Costs: audit {CREDIT_COSTS.audit} · Pre-Publish Check {CREDIT_COSTS.prepublish} · Breakdown {CREDIT_COSTS.breakdown} · Finder search {CREDIT_COSTS.finder} (cached repeats free).
              {plan.watchLimit > 0
                ? <> Monitoring: {watchlist.length}/{plan.watchLimit} channels watched — auto-checks never burn credits.</>
                : <> Monitoring is not included on Free — paid plans re-audit watched channels daily.</>}
            </p>
          </div>
        );
      })()}

      <div className="card">
        <h3>Run a new audit</h3>
        <p className="muted" style={{ marginTop: 0 }}>Paste a public channel URL, @handle or channel ID. The audit samples the ~30 most recent public videos and takes under a minute.</p>
        <form onSubmit={runAudit}>
          <div className="field">
            <label htmlFor="channel">Channel</label>
            <input id="channel" className="field-input" type="text" required value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="youtube.com/@yourchannel" />
          </div>
          <details>
            <summary>Guided self-check (recommended) — signals metadata can't see</summary>
            <p className="muted" style={{ fontSize: ".92rem" }}>Your answers are stored with the audit and shown separately, clearly labelled self-reported. They never change the metadata score.</p>
            {SELF_CHECK_QUESTIONS.map((q) => (
              <div className="field" key={q.key}>
                <label htmlFor={`sc-${q.key}`}>{q.label}</label>
                <select id={`sc-${q.key}`} className="field-input" value={answers[q.key] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}>
                  <option value="">Prefer not to say</option>
                  {q.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}
          </details>
          {err && <p className="err">{err}</p>}
          <button className="btn" type="submit" disabled={running} style={{ marginTop: 14 }}>{running ? "Auditing… (fetching public data)" : "Run audit"}</button>
        </form>
        <div className="honesty">{HONESTY_NOTE}</div>
      </div>

      {(() => {
        const groups = [...groupByChannel(audits).values()].filter((arr) => arr.length >= 2)
          .sort((a, b) => new Date(b[b.length - 1].created_at).getTime() - new Date(a[a.length - 1].created_at).getTime());
        if (!groups.length) return null;
        return (
          <>
            <h2>Channel trends</h2>
            <div className="grid">
              {groups.map((arr) => {
                const first = arr[0];
                const last = arr[arr.length - 1];
                const delta = last.score - first.score;
                return (
                  <div className="card" key={last.channel_id ?? last.id} style={{ marginTop: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                      <div>
                        <b style={{ fontSize: "1.05rem" }}>{last.channel_title ?? last.channel_input}</b><br />
                        <span className="muted" style={{ fontSize: ".9rem" }}>
                          {arr.map((a) => a.score).join(" → ")} · {arr.length} audits ·{" "}
                          <b style={{ color: delta < 0 ? "#0b7a6e" : delta > 0 ? "#dc2626" : "#647d95" }}>
                            {delta === 0 ? "no change" : delta < 0 ? `▼ ${Math.abs(delta)} risk down` : `▲ ${delta} risk up`}
                          </b>
                        </span>
                      </div>
                      <Link className="btn btn-ghost btn-sm" href={`/audit/${last.id}`}>Latest report</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <h2>Watchlist — monitored channels</h2>
      <div className="card" style={{ marginTop: 0 }}>
        <p className="muted" style={{ marginTop: 0 }}>
          Watched channels are re-audited automatically every day. If a risk score jumps (or drops a lot after fixes),
          an alert appears here and is emailed to your account email. Your plan watches up to {planById(planId).watchLimit} channels
          {planById(planId).watchLimit === 0 && <> — monitoring starts on the Solo plan</>}.
        </p>
        <form onSubmit={addToWatch} style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input type="text" placeholder="Channel URL, @handle or ID — runs a first audit, then watches it"
            value={watchInput} onChange={(e) => setWatchInput(e.target.value)} style={{ flex: "1 1 260px" }} />
          <button className="btn" type="submit" disabled={!watchInput.trim()}>Add to watchlist</button>
        </form>
      </div>
      {watchlist.length > 0 && (
        <div className="grid">
          {watchlist.map((w) => {
            const latest = audits.find((a) => a.channel_id === w.channel_id);
            return (
              <div className="card" key={w.id} style={{ marginTop: 0 }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  {w.last_score != null && (
                    <span className={`score-ring sm level-${w.last_level ?? "Low"}`} style={{ "--p": w.last_score } as React.CSSProperties}><b>{w.last_score}</b></span>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{w.channel_title ?? w.channel_id}</b><br />
                    <span className="muted" style={{ fontSize: ".88rem" }}>
                      {w.last_level ?? ""} risk · last checked {w.last_checked_at ? new Date(w.last_checked_at).toLocaleDateString() : "never"}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                  <button className="btn btn-sm" disabled={checkingId === w.id} onClick={() => checkNow(w)}>
                    {checkingId === w.id ? "Checking…" : "Check now"}
                  </button>
                  {latest && <Link className="btn btn-ghost btn-sm" href={`/audit/${latest.id}`}>Latest report</Link>}
                  <button className="btn btn-danger btn-sm" onClick={() => removeWatch(w.id)}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <h2>Past audits</h2>
      {audits.length === 0 ? (
        <p className="muted">No audits yet. Your first one takes under a minute.</p>
      ) : (
        <div className="grid">
          {audits.map((a) => (
            <div className="card" key={a.id} style={{ marginTop: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                <div>
                  <b style={{ fontSize: "1.05rem" }}>{a.channel_title ?? a.channel_input}</b><br />
                  <span className="muted" style={{ fontSize: ".88rem" }}>
                    {new Date(a.created_at).toLocaleDateString()} · {a.video_count_sampled} videos sampled · Risk: {a.level}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span className={`score-ring sm level-${a.level}`} style={{ "--p": a.score } as React.CSSProperties}>
                    <b>{a.score}</b>
                  </span>
                  {a.channel_id && !watchedIds.has(a.channel_id) && (
                    <button className="btn btn-ghost btn-sm" onClick={() => insertWatch(a)}>Watch</button>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => { setChannel(a.channel_input || a.channel_url || ""); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Re-audit</button>
                  <Link className="btn btn-sm" href={`/audit/${a.id}`}>Open report</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <h2>Rejection deadline tracker</h2>
      <p className="muted" style={{ maxWidth: 660 }}>Rejected already? Enter the rejection date and the clocks are computed for you: 21 days to appeal, then 30 days (first rejection) or 90 days (later rejections) before you can reapply.</p>
      {deadlines.map((d) => {
        const { appealBy, reapplyBy, reapplyDays } = deadlineDates(d);
        const fmt = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
        return (
          <div className="card" key={d.id} style={{ marginTop: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{d.channel_title}</b>
              <button className="btn btn-ghost btn-sm" onClick={() => removeDeadline(d.id)}>Remove</button>
            </div>
            <div className="clock-row" style={{ marginTop: 10 }}>
              <div className="clock"><b>{daysLeft(appealBy)} days</b><span className="muted">left to appeal — deadline {fmt(appealBy)}</span></div>
              <div className="clock"><b>{fmt(reapplyBy)}</b><span className="muted">earliest reapply date ({reapplyDays}-day clock)</span></div>
            </div>
            {d.notes && <p className="muted" style={{ marginBottom: 0 }}>{d.notes}</p>}
          </div>
        );
      })}
      <div className="card">
        <h3>Add a rejection</h3>
        <form onSubmit={addDeadline}>
          <div className="field">
            <label htmlFor="dl-channel">Channel name</label>
            <input id="dl-channel" className="field-input" required value={dl.channel_title} onChange={(e) => setDl({ ...dl, channel_title: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="dl-date">Rejection date</label>
            <input id="dl-date" className="field-input" type="date" required value={dl.rejection_date} onChange={(e) => setDl({ ...dl, rejection_date: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="dl-count">Which rejection is this?</label>
            <select id="dl-count" className="field-input" value={dl.rejection_count} onChange={(e) => setDl({ ...dl, rejection_count: Number(e.target.value) })}>
              <option value={1}>First rejection (30-day reapply)</option>
              <option value={2}>Second or later (90-day reapply)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="dl-notes">Notes (optional)</label>
            <input id="dl-notes" className="field-input" value={dl.notes} onChange={(e) => setDl({ ...dl, notes: e.target.value })} />
          </div>
          {dlMsg && <p className="err">{dlMsg}</p>}
          <button className="btn" type="submit">Track deadlines</button>
        </form>
      </div>
    </main>
  );
}
