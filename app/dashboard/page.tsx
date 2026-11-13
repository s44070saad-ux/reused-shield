"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, type Audit, type Deadline, deadlineDates, daysLeft } from "@/lib/supabaseClient";
import { SELF_CHECK_QUESTIONS } from "@/lib/selfCheck";
import { groupByChannel } from "@/lib/auditDiff";
import { PRODUCT_NAME, HONESTY_NOTE, ADMIN_EMAILS } from "@/lib/config";
import type { Session } from "@supabase/supabase-js";

export default function Dashboard() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [audits, setAudits] = useState<Audit[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [channel, setChannel] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [dl, setDl] = useState({ channel_title: "", rejection_date: "", rejection_count: 1, notes: "" });
  const [dlMsg, setDlMsg] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const [a, d] = await Promise.all([
      supabase.from("audits").select("*").order("created_at", { ascending: false }),
      supabase.from("deadlines").select("*").order("rejection_date", { ascending: false }),
    ]);
    if (a.data) setAudits(a.data as Audit[]);
    if (d.data) setDeadlines(d.data as Deadline[]);
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
