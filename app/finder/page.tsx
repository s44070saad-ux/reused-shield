"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase, fmtNum, type FinderSearch } from "@/lib/supabaseClient";
import { PRODUCT_NAME } from "@/lib/config";
import type { Session } from "@supabase/supabase-js";
import type { FinderChannel } from "@/lib/finder";

const EMPTY = {
  keyword: "", referenceChannel: "", dateFrom: "", dateTo: "", type: "all",
  minViews: "", maxViews: "", minSubs: "", maxSubs: "", maxChannelAgeYears: "",
  facelessOnly: false,
};

export default function FinderPage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [running, setRunning] = useState(false);
  const [err, setErr] = useState("");
  const [results, setResults] = useState<FinderChannel[] | null>(null);
  const [reference, setReference] = useState<{ title: string; url: string; subs: number | null; keywords: string } | null>(null);
  const [cached, setCached] = useState(false);
  const [history, setHistory] = useState<FinderSearch[]>([]);

  const loadHistory = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from("finder_searches").select("*").order("created_at", { ascending: false }).limit(10);
    if (data) setHistory(data as FinderSearch[]);
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      setSession(data.session);
      await loadHistory();
      setLoading(false);
    });
  }, [router, loadHistory]);

  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const [breakingDown, setBreakingDown] = useState<string>("");
  async function breakDown(channelUrl: string) {
    if (!session) return;
    setBreakingDown(channelUrl); setErr("");
    try {
      const res = await fetch("/api/breakdown", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ channel: channelUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Breakdown failed.");
      router.push(`/breakdown/${data.id}`);
    } catch (e2: any) {
      setErr(e2.message ?? "Breakdown failed.");
      setBreakingDown("");
    }
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setRunning(true); setErr("");
    try {
      const payload: Record<string, any> = { ...form };
      for (const k of ["minViews", "maxViews", "minSubs", "maxSubs", "maxChannelAgeYears"]) {
        payload[k] = form[k as keyof typeof form] === "" ? undefined : Number(form[k as keyof typeof form]);
      }
      const res = await fetch("/api/finder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Search failed.");
      setResults(data.results as FinderChannel[]);
      setReference(data.reference ?? null);
      setCached(Boolean(data.cached));
      loadHistory();
    } catch (e2: any) {
      setErr(e2.message ?? "Search failed.");
    }
    setRunning(false);
  }

  if (loading) return <main className="wrap"><p className="muted" style={{ paddingTop: 40 }}>Loading…</p></main>;
  if (!supabase) return <main className="wrap"><div className="card"><p className="err">Accounts are not connected yet. Please check back shortly.</p></div></main>;

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/dashboard">← Dashboard</Link>
        <span className="chip">Viral Content Finder</span>
      </div>

      <section className="page-head">
        <h1>Viral Content Finder</h1>
        <p>
          Find channels with breakout videos in a niche — then audit the risk before you copy the format.
          Search by keyword, or seed from a reference channel. A fresh search costs 3 credits
          (identical repeats within 24 hours are free — results are cached).
        </p>
      </section>

      <div className="card">
        <form onSubmit={search}>
          <div className="field">
            <label htmlFor="f-keyword">Niche keyword</label>
            <input id="f-keyword" className="field-input" value={form.keyword} onChange={(e) => set("keyword", e.target.value)} placeholder="e.g. horror stories, space facts, quiz" />
          </div>
          <div className="field">
            <label htmlFor="f-ref">Reference channel <span className="muted">(optional — find channels like this one)</span></label>
            <input id="f-ref" className="field-input" value={form.referenceChannel} onChange={(e) => set("referenceChannel", e.target.value)} placeholder="Paste a channel link or @handle — its niche is derived from its recent videos" />
            <p className="muted" style={{ margin: "6px 0 0", fontSize: ".88rem" }}>Give a keyword, a reference channel, or both (keyword wins for the search; the reference still shows what it was seeded from).</p>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label htmlFor="f-from">Videos published from</label>
              <input id="f-from" className="field-input" type="date" value={form.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-to">…to</label>
              <input id="f-to" className="field-input" type="date" value={form.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="f-type">Format</label>
              <select id="f-type" className="field-input" value={form.type} onChange={(e) => set("type", e.target.value)}>
                <option value="all">Shorts + videos</option>
                <option value="shorts">Shorts only (≤60s)</option>
                <option value="long">Videos only (&gt;60s)</option>
                <option value="long8">Videos only (&gt;8 min)</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="f-age">Max channel age (years)</label>
              <input id="f-age" className="field-input" type="number" min={0} step="0.5" value={form.maxChannelAgeYears} onChange={(e) => set("maxChannelAgeYears", e.target.value)} placeholder="e.g. 1 — new channels only" />
            </div>
            <div className="field">
              <label htmlFor="f-minviews">Min views per video</label>
              <input id="f-minviews" className="field-input" type="number" min={0} value={form.minViews} onChange={(e) => set("minViews", e.target.value)} placeholder="e.g. 100000" />
            </div>
            <div className="field">
              <label htmlFor="f-maxviews">Max views per video</label>
              <input id="f-maxviews" className="field-input" type="number" min={0} value={form.maxViews} onChange={(e) => set("maxViews", e.target.value)} placeholder="optional" />
            </div>
            <div className="field">
              <label htmlFor="f-minsubs">Min subscribers</label>
              <input id="f-minsubs" className="field-input" type="number" min={0} value={form.minSubs} onChange={(e) => set("minSubs", e.target.value)} placeholder="optional" />
            </div>
            <div className="field">
              <label htmlFor="f-maxsubs">Max subscribers</label>
              <input id="f-maxsubs" className="field-input" type="number" min={0} value={form.maxSubs} onChange={(e) => set("maxSubs", e.target.value)} placeholder="e.g. 100000 — small channels" />
            </div>
          </div>
          <div className="field" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input id="f-faceless" type="checkbox" checked={form.facelessOnly} onChange={(e) => set("facelessOnly", e.target.checked)} style={{ width: 22, height: 22 }} />
            <label htmlFor="f-faceless" style={{ margin: 0 }}>Likely faceless only <span className="muted">— a niche-style guess from channel/video wording, not verified (the API can't see faces)</span></label>
          </div>
          {err && <p className="err">{err}</p>}
          <button className="btn" type="submit" disabled={running}>{running ? "Searching YouTube…" : "Find viral channels"}</button>
        </form>
      </div>

      {results !== null && (
        <>
          <h2>{results.length} channel{results.length === 1 ? "" : "s"} found {cached && <span className="chip">cached — 0 quota used</span>}</h2>
          {reference && (
            <p className="muted" style={{ marginTop: 0 }}>
              Seeded from reference channel: <a href={reference.url} target="_blank" rel="noreferrer"><b>{reference.title}</b></a>
              {reference.subs != null && <> ({fmtNum(reference.subs)} subscribers)</>}
              {reference.keywords && <> · niche keywords used: <b>{reference.keywords}</b></>}
            </p>
          )}
          {results.length === 0 && <p className="muted">Nothing matched all those filters. Loosen one — usually max subscribers or the date range is the tightest.</p>}
          <div className="grid">
            {results.map((c) => (
              <div className="card" key={c.id} style={{ marginTop: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div>
                    <a href={c.url} target="_blank" rel="noreferrer" style={{ fontWeight: 800, fontSize: "1.06rem", color: "#142D4C" }}>{c.title}</a><br />
                    <span className="muted" style={{ fontSize: ".88rem" }}>
                      {fmtNum(c.subs)} subscribers · channel age {c.channelAgeYears}y · top video {fmtNum(c.topViews)} views
                      {c.viralRatio != null && <> · <b style={{ color: "#D97706" }}>{c.viralRatio}× views vs subs</b></>}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {c.likelyFaceless && <span className="chip">Likely faceless (guess)</span>}
                    <button className="btn btn-sm" disabled={breakingDown === c.url} onClick={() => breakDown(c.url)}>
                      {breakingDown === c.url ? "Building plan…" : "Break down & plan"}
                    </button>
                    <Link className="btn btn-ghost btn-sm" href={`/dashboard?channel=${encodeURIComponent(c.url)}`}>Audit this channel</Link>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  {c.videos.map((v) => (
                    <p key={v.id} style={{ margin: "0 0 6px", fontSize: ".94rem" }}>
                      <a href={v.url} target="_blank" rel="noreferrer">{v.title || v.id}</a>{" "}
                      <span className="muted">— {fmtNum(v.views)} views · {v.isShort ? "Short" : `${Math.floor(v.durationSec / 60)}m ${v.durationSec % 60}s`} · {new Date(v.publishedAt).toLocaleDateString()}</span>
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
          {results.length > 0 && (
            <div className="honesty">Found a format worth copying? Audit it first — a channel can be viral AND one review away from a reused-content rejection. The audit checks exactly the patterns that get copied formats flagged.</div>
          )}
        </>
      )}

      {history.length > 0 && (
        <>
          <h2>Your recent searches</h2>
          <div className="grid">
            {history.map((h) => (
              <div className="card" key={h.id} style={{ marginTop: 0, padding: "14px 18px" }}>
                <button className="btn btn-ghost btn-sm" style={{ float: "right" }} onClick={() => { setResults(h.results as FinderChannel[]); setReference(h.filters.referenceTitle ? { title: String(h.filters.referenceTitle), url: String(h.filters.referenceUrl ?? "#"), subs: null, keywords: String(h.filters.seedKeywords ?? "") } : null); }}>
                  View results
                </button>
                <b>{String(h.filters.keyword ?? "")}</b>{h.filters.referenceTitle ? <span className="muted"> · ref: {String(h.filters.referenceTitle)}</span> : null}{" "}
                <span className="muted" style={{ fontSize: ".88rem" }}>
                  {new Date(h.created_at).toLocaleString()} · {Array.isArray(h.results) ? h.results.length : 0} channels
                  {h.filters.type && h.filters.type !== "all" ? ` · ${h.filters.type}` : ""}
                  {h.filters.maxSubs ? ` · ≤${fmtNum(Number(h.filters.maxSubs))} subs` : ""}
                  {h.filters.maxChannelAgeYears ? ` · ≤${h.filters.maxChannelAgeYears}y old` : ""}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="muted" style={{ marginTop: 26, fontSize: ".88rem" }}>{PRODUCT_NAME} — Finder results come from public YouTube data. View and subscriber counts are as reported by the API at search time.</p>
    </main>
  );
}
