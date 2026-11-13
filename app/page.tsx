"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { PRODUCT_NAME, HONESTY_NOTE } from "@/lib/config";

const I = (paths: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const FEATURES = [
  { t: "Title templates", d: "How many of your recent titles follow the same formula — the clearest 'mass-produced' fingerprint.", icon: I(<><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h13" /></>) },
  { t: "Thumbnail similarity", d: "Your recent thumbnails are perceptually hashed and compared — near-identical layouts are flagged one by one.", icon: I(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 9" /></>) },
  { t: "Description boilerplate", d: "How much of your description text is the same copy-pasted block on every video.", icon: I(<><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 12h5M10 16h5" /></>) },
  { t: "Upload bursts & pacing", d: "Bulk-upload days and machine-regular cadence that look automated rather than made.", icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
  { t: "Duration clustering", d: "Lots of videos at near-identical lengths suggests a fixed template doing the work.", icon: I(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-8" /><path d="M22 20H2" /></>) },
  { t: "Re-upload patterns", d: "Duplicate titles and Shorts/long-form mix that can indicate recycled uploads.", icon: I(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>) },
  { t: "Viral Content Finder", d: "Discover channels with breakout videos by niche, date range, views, subscribers and channel age — then audit the risk before you copy the format.", icon: I(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M8.5 12.5l2-2 1.5 1.5 2.5-3" /></>) },
  { t: "Guided self-check", d: "Stock footage, AI voice, commentary and transformation — the signals metadata can't see, asked directly and reported separately as self-reported.", icon: I(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 12l2 2 4-4" /></>) },
  { t: "Provenance Vault", d: "Timestamped storage of scripts, voiceover sources and project files per video — the 'made by a human team' evidence an appeal is built from.", icon: I(<><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15" r="1.6" /></>) },
];

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
          <Link className="btn btn-ghost btn-sm" href="/finder">Viral Finder</Link>
          <Link className="btn btn-sm" href="/dashboard">Run a free audit</Link>
        </div>
      </div>

      <section className="hero">
        <div className="hero-grid">
          <div>
            <span className="badge">FREE BETA · NO CARD REQUIRED</span>
            <h1>Find out your reused-content risk <span className="hl">before</span> YouTube tells you.</h1>
            <p className="lede">
              Since YouTube's July 2025 clarification of the reused-content policy — enforced as "inauthentic,
              mass-produced" content — faceless and automation channels have been losing monetization in waves,
              including channels that believed they were compliant. {PRODUCT_NAME} audits your channel's public
              signals, shows you exactly what looks templated, and helps you build the evidence trail an appeal needs.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
              <Link className="btn btn-white" href="/dashboard">Audit my channel — free beta</Link>
              <a className="btn btn-outline-w" href="#sample">See a sample report</a>
            </div>
            <div className="hero-stats">
              <div><b>6</b><span>risk signals measured</span></div>
              <div><b>~3 units</b><span>of API quota per audit</span></div>
              <div><b>21 days</b><span>appeal clock — tracked for you</span></div>
            </div>
          </div>
          <div className="glass-card">
            <span className="sample-tag">SAMPLE</span>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14 }}>
              <div className="score-ring level-High" style={{ "--p": 63, width: 96, height: 96 } as React.CSSProperties}><b style={{ fontSize: "1.6rem" }}>63</b><small>risk / 100</small></div>
              <div>
                <h3>Risk level: High</h3>
                <p className="muted" style={{ margin: 0, fontSize: ".92rem" }}>16 of the last 20 titles follow the same template. 13 of 20 thumbnails look near-identical.</p>
              </div>
            </div>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".88rem" }}><span>Title templates</span><b>82</b></div>
              <div className="bar"><div style={{ width: "82%" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".88rem", marginTop: 10 }}><span>Thumbnail similarity</span><b>74</b></div>
              <div className="bar"><div style={{ width: "74%" }} /></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: ".88rem", marginTop: 10 }}><span>Description boilerplate</span><b>61</b></div>
              <div className="bar"><div style={{ width: "61%" }} /></div>
            </div>
            <p className="muted" style={{ fontSize: ".82rem", marginBottom: 0 }}>Illustrative sample — your report lists every flagged video and an ordered fix list.</p>
          </div>
        </div>
      </section>

      <h2>How it works</h2>
      <div className="steps">
        {[
          ["Paste your channel", "Any public channel URL, @handle or channel ID. No Google login, no OAuth — public data only."],
          ["Get your risk report", "Six public signals measured and explained in plain language, with per-video flags and a fix list ordered by impact."],
          ["Fix it — or build your appeal", "Follow the fix list before you apply. Already rejected? Your Provenance Vault and Appeal Pack are built from the same report."],
        ].map(([t, d], i) => (
          <div className="card feature step" key={t}>
            <span className="step-num">{i + 1}</span>
            <h3>{t}</h3>
            <p className="muted" style={{ margin: 0 }}>{d}</p>
          </div>
        ))}
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
      <p className="section-sub">Every signal is computed from public data and explained in plain language — no black-box score.</p>
      <div className="grid grid-3">
        {FEATURES.map((f) => (
          <div className="card feature" key={f.t}>
            <span className="icon-chip">{f.icon}</span>
            <h3>{f.t}</h3>
            <p className="muted" style={{ margin: 0 }}>{f.d}</p>
          </div>
        ))}
      </div>

      <h2 id="sample">Sample audit report</h2>
      <div className="card report-window">
        <div className="report-window-bar"><i /><i /><i /><span className="sample-tag" style={{ marginLeft: 8 }}>SAMPLE — ILLUSTRATIVE DATA ONLY</span></div>
        <div className="report-window-body">
        <div style={{ display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          <div className="score-ring level-High" style={{ "--p": 63 } as React.CSSProperties}><b>63</b><small>risk score / 100</small></div>
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
      <p className="footer-note">{PRODUCT_NAME} — a risk estimate from public signals. Only YouTube decides monetization. Free beta, no payments yet.</p>
    </main>
  );
}
