"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { PRODUCT_NAME, HONESTY_NOTE } from "@/lib/config";
import type { PrePublishResult } from "@/lib/prepublish";

interface HistoryRow {
  id: string;
  channel_title: string | null;
  title: string;
  overall: number;
  verdict: string | null;
  created_at: string;
}

const bandOf = (o: number) => (o >= 75 ? "level-Critical" : o >= 55 ? "level-High" : o >= 30 ? "level-Moderate" : "level-Low");

export default function PrePublishPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [channel, setChannel] = useState("");
  const [channelTitle, setChannelTitle] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [thumbB64, setThumbB64] = useState("");
  const [thumbPreview, setThumbPreview] = useState("");
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<PrePublishResult | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("prepublish_checks").select("id, channel_title, title, overall, verdict, created_at").order("created_at", { ascending: false }).limit(15);
    if (data) setHistory(data as HistoryRow[]);
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setToken(data.session.access_token);
      await loadHistory();
    });
  }, [router, loadHistory]);

  function onThumb(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const s = String(reader.result ?? "");
      setThumbB64(s);
      setThumbPreview(s);
    };
    reader.readAsDataURL(f);
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setRunning(true); setErr(""); setResult(null);
    try {
      const res = await fetch("/api/prepublish", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ channel_input: channel.trim(), title: title.trim(), description: description.trim() || undefined, thumbnail: thumbB64 || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The check failed.");
      setResult(data.result as PrePublishResult);
      setChannelTitle(data.channelTitle ?? "");
      await loadHistory();
    } catch (e2: any) {
      setErr(e2?.message ?? "The check failed.");
    } finally {
      setRunning(false);
    }
  }

  async function signOut() {
    await supabase?.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/">
          <svg className="yt-mark" width="32" height="23" viewBox="0 0 30 21" aria-hidden="true"><rect width="30" height="21" rx="5" fill="#FF0033" /><path d="M12.2 6.4l7 4.1-7 4.1z" fill="#fff" /></svg>
          {PRODUCT_NAME.replace(/ Shield$/, "")} <span>Shield</span>
        </Link>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost btn-sm" href="/dashboard">Dashboard</Link>
          <Link className="btn btn-ghost btn-sm" href="/finder">Finder</Link>
          <button className="btn btn-ghost btn-sm" onClick={signOut}>Sign out</button>
        </div>
      </div>

      <section className="page-head">
        <h1>Pre-Publish Check</h1>
        <p>Before you upload: check a planned title, thumbnail and description against your own channel's recent pattern — so the next video doesn't dig the reused-content hole deeper.</p>
      </section>

      <div className="card">
        <form onSubmit={run}>
          <div className="field">
            <label htmlFor="pp-channel">Channel this upload is for</label>
            <input id="pp-channel" className="field-input" required value={channel} onChange={(e) => setChannel(e.target.value)} placeholder="youtube.com/@yourchannel" />
          </div>
          <div className="field">
            <label htmlFor="pp-title">Planned title</label>
            <input id="pp-title" className="field-input" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="The exact title you're about to publish" maxLength={150} />
          </div>
          <div className="field">
            <label htmlFor="pp-thumb">Planned thumbnail <span className="muted">(optional — hashed for comparison, never stored)</span></label>
            <input id="pp-thumb" ref={fileRef} className="field-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={onThumb} />
            {thumbPreview && (
              <div style={{ marginTop: 10, display: "flex", gap: 12, alignItems: "center" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbPreview} alt="Planned thumbnail preview" style={{ width: 160, borderRadius: 10, border: "1px solid #dfe7f0" }} />
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setThumbB64(""); setThumbPreview(""); if (fileRef.current) fileRef.current.value = ""; }}>Remove</button>
              </div>
            )}
          </div>
          <div className="field">
            <label htmlFor="pp-desc">Planned description <span className="muted">(optional)</span></label>
            <textarea id="pp-desc" className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Paste the description you plan to use — we'll measure how much is copy-pasted from your past videos." />
          </div>
          {err && <p className="err">{err}</p>}
          <button className="btn" type="submit" disabled={running}>{running ? "Checking against your last 20 videos…" : "Check before publishing"}</button>
        </form>
        <div className="honesty">{HONESTY_NOTE}</div>
      </div>

      {result && (
        <div className="card">
          <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
            <div className={`score-ring ${bandOf(result.overall)}`} style={{ "--p": result.overall } as React.CSSProperties}><b>{result.overall}</b><small>sameness / 100</small></div>
            <div style={{ flex: "1 1 260px" }}>
              <h3 style={{ fontSize: "1.25rem" }}>{result.verdict}</h3>
              <p className="muted" style={{ margin: 0 }}>
                Compared against {result.comparedVideos} recent videos{channelTitle ? <> on <b>{channelTitle}</b></> : null}.
                Higher = more templated. This is a sameness estimate from public signals — only YouTube decides policy outcomes.
              </p>
            </div>
          </div>
          {result.parts.map((p) => (
            <div key={p.key} style={{ marginTop: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}><b>{p.label}</b><span className="muted">{p.score}/100</span></div>
              <div className="bar"><div style={{ width: `${p.score}%` }} /></div>
              <p className="muted" style={{ margin: "6px 0 0", fontSize: ".92rem" }}>{p.detail}</p>
            </div>
          ))}
          {result.warnings.length > 0 && (
            <>
              <h3 style={{ marginTop: 22 }}>Warnings</h3>
              <ul style={{ margin: 0, paddingLeft: 20 }}>{result.warnings.map((w, i) => <li key={i} style={{ marginBottom: 6 }}>{w}</li>)}</ul>
            </>
          )}
          {result.fixes.length > 0 && (
            <>
              <h3 style={{ marginTop: 18 }}>Do this before publishing</h3>
              <ol style={{ margin: 0, paddingLeft: 20 }}>{result.fixes.map((f, i) => <li key={i} style={{ marginBottom: 6 }}>{f}</li>)}</ol>
            </>
          )}
        </div>
      )}

      {history.length > 0 && (
        <>
          <h2>Your past checks</h2>
          <div className="grid">
            {history.map((h) => (
              <div className="card" key={h.id} style={{ marginTop: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <div>
                    <b>{h.title}</b><br />
                    <span className="muted" style={{ fontSize: ".88rem" }}>{h.channel_title ?? ""} · {new Date(h.created_at).toLocaleDateString()} · {h.verdict ?? ""}</span>
                  </div>
                  <span className={`score-ring sm ${bandOf(h.overall)}`} style={{ "--p": h.overall } as React.CSSProperties}><b>{h.overall}</b></span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
