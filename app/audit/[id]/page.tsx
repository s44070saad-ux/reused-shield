"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase, type Audit, type ProvenanceEntry } from "@/lib/supabaseClient";
import { SELF_CHECK_QUESTIONS, selfCheckFlags } from "@/lib/selfCheck";
import { HONESTY_NOTE } from "@/lib/config";
import type { Session } from "@supabase/supabase-js";

const KINDS = [
  { v: "script", label: "Script draft / text" },
  { v: "voiceover", label: "Voiceover file or link" },
  { v: "sources", label: "Source links" },
  { v: "project-file", label: "Project file reference" },
  { v: "note", label: "Note" },
];

export default function AuditReport() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [prov, setProv] = useState<ProvenanceEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [form, setForm] = useState({ video_ref: "", kind: "script", title: "", detail: "", link: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.from("audits").select("*").eq("id", id).single();
    if (error || !data) { setErr("Audit not found — or it belongs to a different account."); setLoading(false); return; }
    setAudit(data as Audit);
    const p = await supabase.from("provenance_entries").select("*").eq("audit_id", id).order("created_at", { ascending: false });
    if (p.data) setProv(p.data as ProvenanceEntry[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setSession(data.session);
      load();
    });
  }, [router, load]);

  async function addProvenance(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase || !session || !audit) return;
    setSaving(true);
    const { error } = await supabase.from("provenance_entries").insert({
      user_id: session.user.id, audit_id: audit.id,
      video_ref: form.video_ref.trim(), kind: form.kind, title: form.title.trim(),
      detail: form.detail.trim() || null, link: form.link.trim() || null,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setForm({ video_ref: "", kind: "script", title: "", detail: "", link: "" });
    load();
  }

  async function removeProv(pid: string) {
    if (!supabase) return;
    await supabase.from("provenance_entries").delete().eq("id", pid);
    load();
  }

  if (loading) return <main className="wrap"><p className="muted" style={{ paddingTop: 40 }}>Loading report…</p></main>;
  if (!audit) return <main className="wrap"><div className="card"><p className="err">{err || "Audit not found."}</p><Link className="btn btn-sm" href="/dashboard">Back to dashboard</Link></div></main>;

  const scFlags = audit.self_check ? selfCheckFlags(audit.self_check) : [];

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/dashboard">← Dashboard</Link>
        <Link className="btn btn-sm" href={`/appeal/${audit.id}`}>Build Appeal Pack</Link>
      </div>

      <div className="card">
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div className={`score-ring level-${audit.level}`} style={{ "--p": audit.score } as React.CSSProperties}><b>{audit.score}</b><small>risk / 100</small></div>
          <div style={{ flex: "1 1 280px" }}>
            <h1 style={{ fontSize: "1.6rem", margin: "0 0 6px" }}>{audit.channel_title ?? audit.channel_input}</h1>
            <p className="muted" style={{ margin: 0 }}>
              Risk level: <b style={{ color: "#142D4C" }}>{audit.level}</b> · {audit.video_count_sampled} recent public videos sampled · {new Date(audit.created_at).toLocaleDateString()}
              {audit.subscriber_count ? ` · ${audit.subscriber_count.toLocaleString()} subscribers` : ""}
              {audit.channel_url ? <> · <a href={audit.channel_url} target="_blank" rel="noreferrer">View channel</a></> : null}
            </p>
          </div>
        </div>
        <div className="honesty">{HONESTY_NOTE}</div>
      </div>

      {audit.reasons.length > 0 && (
        <>
          <h2>Why this score — in plain language</h2>
          <div className="card" style={{ marginTop: 0 }}>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {audit.reasons.map((r, i) => <li key={i} style={{ marginBottom: 8 }}>{r}</li>)}
            </ul>
          </div>
        </>
      )}

      <h2>Signals (from public metadata)</h2>
      <div className="grid">
        {audit.signals.map((s) => (
          <div className="card" key={s.key} style={{ marginTop: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{s.label}</b><span className="muted">{s.score}/100</span>
            </div>
            <div className="bar"><div style={{ width: `${s.score}%` }} /></div>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: ".93rem" }}>{s.detail}</p>
          </div>
        ))}
      </div>

      <h2>Fix list — ordered by impact</h2>
      <div className="card" style={{ marginTop: 0 }}>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          {audit.fixes.map((f, i) => <li key={i} style={{ marginBottom: 8 }}>{f}</li>)}
        </ol>
      </div>

      <h2>Per-video flags</h2>
      <div className="card" style={{ marginTop: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Video</th><th>Length</th><th>Flags</th></tr></thead>
          <tbody>
            {audit.videos.map((v) => (
              <tr key={v.id}>
                <td><a href={`https://www.youtube.com/watch?v=${v.id}`} target="_blank" rel="noreferrer">{v.title || v.id}</a><br /><span className="muted">{new Date(v.publishedAt).toLocaleDateString()}</span></td>
                <td>{v.isShort ? "Short" : `${Math.floor(v.durationSec / 60)}m ${v.durationSec % 60}s`}</td>
                <td>{v.flags.length ? v.flags.map((f) => <span className="flag" key={f}>{f}</span>) : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {audit.self_check && (
        <>
          <h2>Self-check (self-reported — not from metadata)</h2>
          <div className="card" style={{ marginTop: 0 }}>
            {SELF_CHECK_QUESTIONS.map((q) => audit.self_check?.[q.key] ? (
              <p key={q.key} style={{ margin: "0 0 8px" }}><b>{q.label}</b><br /><span className="muted">{audit.self_check[q.key]}</span></p>
            ) : null)}
            {scFlags.length > 0 && (
              <>
                <p><b>Self-reported risk flags:</b></p>
                <ul style={{ margin: 0, paddingLeft: 20 }}>{scFlags.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </>
            )}
          </div>
        </>
      )}

      <h2>Provenance Vault — this channel</h2>
      <p className="muted" style={{ maxWidth: 680 }}>
        Store the evidence that a human team made each video: scripts, voiceover sources, source links, project
        files. Every entry is timestamped when saved — that trail is exactly what a strong appeal is built from.
        Start now, before you ever need it.
      </p>
      {prov.length > 0 && (
        <div className="grid">
          {prov.map((p) => (
            <div className="card" key={p.id} style={{ marginTop: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <b>{p.title}</b>
                <button className="btn btn-ghost btn-sm" onClick={() => removeProv(p.id)}>Delete</button>
              </div>
              <p className="muted" style={{ margin: "4px 0", fontSize: ".9rem" }}>
                <span className="chip">{KINDS.find((k) => k.v === p.kind)?.label ?? p.kind}</span>
                Video: {p.video_ref} · Saved {new Date(p.created_at).toLocaleString()}
              </p>
              {p.detail && <p style={{ margin: "6px 0", whiteSpace: "pre-wrap" }}>{p.detail}</p>}
              {p.link && <a href={p.link} target="_blank" rel="noreferrer">Open linked evidence</a>}
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <h3>Add provenance</h3>
        <form onSubmit={addProvenance}>
          <div className="field">
            <label htmlFor="pv-video">Video (title or YouTube ID/URL)</label>
            <input id="pv-video" className="field-input" required value={form.video_ref} onChange={(e) => setForm({ ...form, video_ref: e.target.value })} placeholder="Paste the video title or link" />
          </div>
          <div className="field">
            <label htmlFor="pv-kind">Evidence type</label>
            <select id="pv-kind" className="field-input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              {KINDS.map((k) => <option key={k.v} value={k.v}>{k.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="pv-title">Title</label>
            <input id="pv-title" className="field-input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Original script v3 — written by our writer" />
          </div>
          <div className="field">
            <label htmlFor="pv-detail">Detail / script text (optional)</label>
            <textarea id="pv-detail" className="field-input" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="Paste the script draft, or describe the evidence" />
          </div>
          <div className="field">
            <label htmlFor="pv-link">Link (optional — Drive file, voiceover file, source)</label>
            <input id="pv-link" className="field-input" type="url" value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" />
          </div>
          {err && <p className="err">{err}</p>}
          <button className="btn" type="submit" disabled={saving}>{saving ? "Saving…" : "Save provenance (timestamped)"}</button>
        </form>
      </div>

      <div className="card">
        <h3>Rejected already?</h3>
        <p className="muted">Build the Appeal Pack for this channel: the audit, your provenance per flagged video, a factual appeal-letter template you edit, and your deadline clocks.</p>
        <Link className="btn" href={`/appeal/${audit.id}`}>Build Appeal Pack</Link>
      </div>
    </main>
  );
}
