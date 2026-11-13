"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { PRODUCT_NAME, HONESTY_NOTE } from "@/lib/config";

const SAMPLE_SIGNALS = [
  { label: "Title template repetition", score: 82, detail: "16 of 20 recent titles are highly similar to another title. Biggest shared opening phrase repeats 11 times." },
  { label: "Thumbnail similarity", score: 74, detail: "13 of 20 thumbnails are visually near-identical to another thumbnail (26 similar pairs)." },
  { label: "Description boilerplate", score: 61, detail: "61% of all description text is blocks repeated across half or more of the sampled videos." },
  { label: "Duration clustering", score: 48, detail: "70% of long-form videos sit within ±10% of the median length." },
  { label: "Upload cadence / bursts", score: 36, detail: "2 day(s) with 3+ uploads in the sample. Median gap between uploads: 0.9 days." },
  { label: "Shorts mix & re-upload patterns", score: 25, detail: "1 exact duplicate title found (possible re-upload)." },
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [role, setRole] = useState("Channel owner");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setState("error"); setMsg("Waitlist is not connected yet — try again shortly."); return; }
    setState("saving");
    const { error } = await supabase.from("waitlist").insert({ email: email.trim(), channel_url: channelUrl.trim() || null, role });
    if (error) { setState("error"); setMsg("That didn't save. Check the email address and try again."); return; }
    setState("done");
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/">{PRODUCT_NAME.split(" ")[0]} <span>Shield</span></Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost btn-sm" href="/login">Sign in</Link>
          <Link className="btn btn-sm" href="/dashboard">Run a free audit</Link>
        </div>
      </div>

      <h1>Find out your reused-content risk <span style={{ color: "#f59e0b" }}>before</span> YouTube tells you.</h1>
      <p className="lede">
        Since YouTube's July 2025 clarification of the reused-content policy — enforced as "inauthentic,
        mass-produced" content — faceless and automation channels have been losing monetization in waves,
        including channels that believed they were compliant. {PRODUCT_NAME} audits your channel's public
        signals, shows you exactly what looks templated, and helps you build the evidence trail an appeal needs.
      </p>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
        <Link className="btn" href="/dashboard">Audit my channel — free beta</Link>
        <a className="btn btn-ghost" href="#sample">See a sample report</a>
      </div>

      <h2>The clocks are brutal</h2>
      <div className="clock-row">
        <div className="clock"><b>21 days</b><span className="muted">to appeal after a monetization rejection — miss it and the decision stands.</span></div>
        <div className="clock"><b>30 days</b><span className="muted">before you can reapply after a first rejection.</span></div>
        <div className="clock"><b>90 days</b><span className="muted">before you can reapply after later rejections.</span></div>
        <div className="clock"><b>4,000 hrs</b><span className="muted">of watch time at risk — deleting videos deletes their watch hours too.</span></div>
      </div>
      <p className="muted" style={{ maxWidth: 680 }}>
        Most owners find out they have a problem from the rejection email itself — when the 21-day clock is
        already running. An audit before you apply (or before the next review) costs minutes. A rejected
        application costs months.
      </p>

      <h2>What the audit checks</h2>
      <div className="grid grid-2">
        {[
          ["Title templates", "How many of your recent titles follow the same formula — the clearest 'mass-produced' fingerprint."],
          ["Thumbnail similarity", "Your recent thumbnails are perceptually hashed and compared — near-identical layouts are flagged one by one."],
          ["Description boilerplate", "How much of your description text is the same copy-pasted block on every video."],
          ["Upload bursts & pacing", "Bulk-upload days and machine-regular cadence that look automated rather than made."],
          ["Duration clustering", "Lots of videos at near-identical lengths suggests a fixed template doing the work."],
          ["Re-upload patterns", "Duplicate titles and Shorts/long-form mix that can indicate recycled uploads."],
          ["Guided self-check", "Stock footage, AI voice, commentary and transformation — the signals metadata can't see, asked directly and reported separately as self-reported."],
          ["Provenance Vault", "Timestamped storage of scripts, voiceover sources and project files per video — the 'made by a human team' evidence an appeal is built from."],
        ].map(([t, d]) => (
          <div className="card" key={t}><h3>{t}</h3><p className="muted" style={{ margin: 0 }}>{d}</p></div>
        ))}
      </div>

      <h2 id="sample">Sample audit report</h2>
      <div className="card">
        <span className="sample-tag">SAMPLE — ILLUSTRATIVE DATA ONLY</span>
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap", marginTop: 16 }}>
          <div className="score-ring level-High"><b>63</b><small>risk score / 100</small></div>
          <div style={{ flex: "1 1 260px" }}>
            <h3 style={{ fontSize: "1.25rem" }}>Risk level: High</h3>
            <p className="muted" style={{ margin: 0 }}>
              Top reason: 16 of the last 20 titles follow the same template — the classic "one formula"
              pattern reviewers flag. 13 of 20 thumbnails look near-identical. Fix list is ordered by impact,
              starting with titles and thumbnails.
            </p>
          </div>
        </div>
        {SAMPLE_SIGNALS.map((s) => (
          <div key={s.label} style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{s.label}</b><span className="muted">{s.score}/100</span>
            </div>
            <div className="bar"><div style={{ width: `${s.score}%` }} /></div>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: ".92rem" }}>{s.detail}</p>
          </div>
        ))}
        <p className="muted" style={{ fontSize: ".9rem" }}>Every flagged video is listed in the full report with its specific flags, plus an ordered fix list and cleanup cautions (delete slowly — deletions cost watch hours).</p>
      </div>

      <div className="honesty"><b>Straight talk:</b> {HONESTY_NOTE} Anyone who promises you guaranteed monetization approval is selling you something.</div>

      <h2>Join the early-access list</h2>
      <div className="card">
        {state === "done" ? (
          <p className="ok" style={{ margin: 0 }}>You're on the list. We'll email you when your audit slot opens.</p>
        ) : (
          <form onSubmit={joinWaitlist}>
            <div className="field">
              <label htmlFor="wl-email">Email</label>
              <input id="wl-email" className="field-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            </div>
            <div className="field">
              <label htmlFor="wl-channel">Channel URL <span className="muted">(optional)</span></label>
              <input id="wl-channel" className="field-input" type="text" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} placeholder="youtube.com/@yourchannel" />
            </div>
            <div className="field">
              <label htmlFor="wl-role">I am a…</label>
              <select id="wl-role" className="field-input" value={role} onChange={(e) => setRole(e.target.value)}>
                <option>Channel owner</option>
                <option>Automation team</option>
                <option>Agency managing client channels</option>
                <option>Editor / freelancer</option>
                <option>Other</option>
              </select>
            </div>
            {state === "error" && <p className="err">{msg}</p>}
            {!isSupabaseConfigured && <p className="muted">Waitlist opening shortly.</p>}
            <button className="btn" type="submit" disabled={state === "saving"}>{state === "saving" ? "Joining…" : "Join the waitlist"}</button>
          </form>
        )}
      </div>

      <p className="muted" style={{ marginTop: 34, fontSize: ".88rem" }}>
        Already rejected? The appeal clock matters more than the audit: sign in, add your rejection date to the
        deadline tracker, and build your Appeal Pack from your provenance entries.
      </p>
    </main>
  );
}
