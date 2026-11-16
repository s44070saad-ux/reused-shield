"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { PRODUCT_NAME, HONESTY_NOTE, PLANS, CREDIT_COSTS, SIGNUP_BONUS_CREDITS } from "@/lib/config";

const I = (paths: React.ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>
);
const FEATURES = [
  { t: "Title templates", d: "How many recent titles follow one formula — the clearest 'mass-produced' fingerprint.", icon: I(<><path d="M4 6h16" /><path d="M4 12h10" /><path d="M4 18h13" /></>) },
  { t: "Thumbnail similarity", d: "Thumbnails perceptually hashed and compared — near-identical layouts flagged one by one.", icon: I(<><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-9 9" /></>) },
  { t: "Description boilerplate", d: "How much of your description is the same copy-pasted block on every video.", icon: I(<><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4" /><path d="M10 12h5M10 16h5" /></>) },
  { t: "Upload bursts & pacing", d: "Bulk-upload days and machine-regular cadence that read as automated.", icon: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>) },
  { t: "Duration clustering", d: "Videos at near-identical lengths suggest one fixed template doing the work.", icon: I(<><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-8" /><path d="M22 20H2" /></>) },
  { t: "Re-upload patterns", d: "Duplicate titles and format mix that can indicate recycled uploads.", icon: I(<><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></>) },
  { t: "Viral Content Finder", d: "Breakout channels by niche, language, views and age — audited before you copy the format.", icon: I(<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M8.5 12.5l2-2 1.5 1.5 2.5-3" /></>) },
  { t: "Guided self-check", d: "The signals metadata can't see — asked directly, reported separately as self-reported.", icon: I(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4a3 3 0 0 1 6 0" /><path d="M9 12l2 2 4-4" /></>) },
  { t: "Provenance Vault", d: "Timestamped scripts, voice sources and project files — the evidence an appeal is built from.", icon: I(<><rect x="4" y="10" width="16" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /><circle cx="12" cy="15" r="1.6" /></>) },
];

const SAMPLE_SIGNALS = [
  { label: "Title template repetition", score: 82, detail: "16 of 20 titles highly similar · biggest opening phrase repeats 11×" },
  { label: "Thumbnail similarity", score: 74, detail: "13 of 20 thumbnails near-identical (26 similar pairs)" },
  { label: "Description boilerplate", score: 61, detail: "61% of description text repeats across half or more of the videos" },
  { label: "Duration clustering", score: 48, detail: "70% of long videos sit within ±10% of the median length" },
  { label: "Upload cadence / bursts", score: 36, detail: "2 days with 3+ uploads · median gap between uploads 0.9 days" },
  { label: "Shorts mix & re-upload patterns", score: 25, detail: "1 exact duplicate title found — a possible re-upload" },
];

const FAQS = [
  { q: "Is the score a guarantee of monetization?", a: "No — and anyone who promises that is lying to you. The score is a risk estimate computed from your channel's public signals. Only YouTube decides monetization. What the audit does is show you exactly which patterns look templated, so you can fix them before a human reviewer sees them." },
  { q: "What data do you use? Do you need my Google login?", a: "Public YouTube data only — titles, descriptions, thumbnails, dates, durations, view counts. No OAuth, no channel login, no private analytics. If it's not visible on your public channel page, we never see it." },
  { q: "How does subscribing work?", a: "Pick a plan on the Subscribe page and send the request with a contact (WhatsApp or email). We reply with payment instructions, you pay, and we activate your plan by hand — usually the same day. Nothing is charged automatically, ever." },
  { q: "I'm already rejected. Can this still help?", a: "Yes — that's what the Appeal Pack is for. Add your rejection date to the deadline tracker (the appeal window is 21 days), log your production evidence in the Provenance Vault, and generate a structured appeal letter from your audit data." },
  { q: "Which channels is this built for?", a: "Faceless and automation channels — quiz, stories, facts, compilations, AI-narrated formats — plus the agencies and editors who run them. Those are exactly the channels YouTube's 'inauthentic content' enforcement hits hardest." },
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [channelUrl, setChannelUrl] = useState("");
  const [role, setRole] = useState("Channel owner");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function joinWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setState("error"); setMsg("Requests are not connected yet — try again shortly."); return; }
    setState("saving");
    const { error } = await supabase.from("waitlist").insert({ email: email.trim(), channel_url: channelUrl.trim() || null, role });
    if (error) { setState("error"); setMsg("That didn't save. Check the email address and try again."); return; }
    setState("done");
  }

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/"><svg className="yt-mark" width="32" height="23" viewBox="0 0 30 21" aria-hidden="true"><rect width="30" height="21" rx="5" fill="#FF0033"/><path d="M12.2 6.4l7 4.1-7 4.1z" fill="#fff"/></svg>{PRODUCT_NAME.replace(/ Shield$/, "")} <span>Shield</span></Link>
        <nav className="nav-links">
          <a href="#product">Product</a>
          <a href="#sample">Sample report</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn btn-ghost btn-sm" href="/login">Sign in</Link>
          <Link className="btn btn-sm" href="/subscribe">Get started</Link>
        </div>
      </div>

      <section className="hero">
        <div className="hero-grid">
          <div>
            <span className="badge">DAILY MONITORING · EMAIL ALERTS · APPEAL PACK</span>
            <h1>Know your reused-content risk <span className="hl">before</span> YouTube tells you.</h1>
            <p className="lede">
              Faceless and automation channels are losing monetization in waves under YouTube's "inauthentic
              content" enforcement. We audit your channel's public signals, show you exactly what looks
              templated, and track your risk every day after.
            </p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 20 }}>
              <Link className="btn btn-white" href="/subscribe">Get started</Link>
              <a className="btn btn-outline-w" href="#sample">See a sample report</a>
            </div>
            <div className="hero-stats">
              <div><b>6</b><span>risk signals per audit</span></div>
              <div><b>30</b><span>videos sampled per report</span></div>
              <div><b>Daily</b><span>re-audits on paid plans</span></div>
              <div><b>21 days</b><span>appeal clock, tracked</span></div>
            </div>
          </div>
          <div className="glass-card">
            <span className="sample-tag">SAMPLE</span>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 14 }}>
              <div className="score-ring level-High" style={{ "--p": 63, width: 96, height: 96 } as React.CSSProperties}><b style={{ fontSize: "1.6rem" }}>63</b><small>risk / 100</small></div>
              <div>
                <h3>Risk level: High</h3>
                <p className="muted" style={{ margin: 0, fontSize: ".92rem" }}>16 of the last 20 titles follow one template. 13 of 20 thumbnails look near-identical.</p>
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
            <div className="mock-alert">▲ <b>Watchlist alert</b> — risk up +14 since yesterday · email sent</div>
          </div>
        </div>
      </section>

      <h2 id="product">One dashboard for every channel you run</h2>
      <p className="section-sub">Audits, niche research, upload checks and daily monitoring — one workspace, built for automation teams.</p>
      <div className="card report-window">
        <div className="report-window-bar"><i /><i /><i /><span className="muted" style={{ marginLeft: 8, fontSize: ".85rem" }}>app — your workspace</span></div>
        <div className="report-window-body">
          <div className="mock-grid">
            <div className="mock-panel">
              <h3>Latest audit</h3>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="score-ring level-Moderate sm" style={{ "--p": 42 } as React.CSSProperties}><b>42</b></div>
                <div><b>Quiz Galaxy</b><br /><span className="muted" style={{ fontSize: ".88rem" }}>Moderate risk · 30 videos · fix list ready</span></div>
              </div>
              <div className="mock-row"><span>Title templates</span><b>58</b></div>
              <div className="mock-row"><span>Thumbnails</span><b>44</b></div>
              <div className="mock-row"><span>Descriptions</span><b>31</b></div>
            </div>
            <div className="mock-panel">
              <h3>Watchlist · daily</h3>
              <div className="mock-row"><span>Horror Vault</span><span className="chip" style={{ background: "#dcfce7", borderColor: "#86efac", margin: 0 }}>18 Low</span></div>
              <div className="mock-row"><span>Quiz Galaxy</span><span className="chip" style={{ background: "#fef3c7", borderColor: "#fcd34d", margin: 0 }}>42 Mod</span></div>
              <div className="mock-row"><span>Facts Daily</span><span className="chip" style={{ background: "#fee2e2", borderColor: "#fca5a5", margin: 0 }}>71 High</span></div>
              <p className="muted" style={{ fontSize: ".85rem", margin: "10px 0 0" }}>Risk moves ±10 → you get an email the same morning.</p>
            </div>
            <div className="mock-panel">
              <h3>Viral Finder</h3>
              <div className="mock-row"><span>horror stories · Hindi</span><b>17 channels</b></div>
              <div className="mock-row"><span>Top breakout</span><b>92× views/subs</b></div>
              <div className="mock-row"><span>space facts · English</span><b>23 channels</b></div>
              <p className="muted" style={{ fontSize: ".85rem", margin: "10px 0 0" }}>Find the format — then audit its risk before copying it.</p>
            </div>
          </div>
        </div>
      </div>

      <div className="clock-row" style={{ marginTop: 22 }}>
        <div className="clock"><b>21 days</b><span className="muted">to appeal a rejection — then the decision stands</span></div>
        <div className="clock"><b>30 days</b><span className="muted">to reapply after a first rejection</span></div>
        <div className="clock"><b>90 days</b><span className="muted">to reapply after later rejections</span></div>
        <div className="clock"><b>4,000 hrs</b><span className="muted">of watch time lost when videos are deleted</span></div>
      </div>
      <p className="muted" style={{ marginTop: 12 }}>Most owners learn they have a problem from the rejection email — with the clock already running. An audit takes about a minute.</p>

      <h2>How it works</h2>
      <div className="steps">
        {[
          ["Paste your channel", "Any public URL, @handle or channel ID. Public data only — no Google login."],
          ["Get your risk report", "Six signals measured and explained, per-video flags, fix list ordered by impact."],
          ["Fix it — or appeal it", "Clean up before you apply. Already rejected? Build your Appeal Pack from the same data."],
        ].map(([t, d], i) => (
          <div className="card feature step" key={t}>
            <span className="step-num">{i + 1}</span>
            <h3>{t}</h3>
            <p className="muted" style={{ margin: 0 }}>{d}</p>
          </div>
        ))}
      </div>

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
              Top reason: 16 of the last 20 titles follow one template. 13 of 20 thumbnails look near-identical.
              The fix list starts with titles and thumbnails.
            </p>
          </div>
        </div>
        {SAMPLE_SIGNALS.map((s) => (
          <div key={s.label} style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <b>{s.label}</b><span className="muted">{s.score}/100</span>
            </div>
            <div className="bar"><div style={{ width: `${s.score}%` }} /></div>
            <p className="muted" style={{ margin: "5px 0 0", fontSize: ".9rem" }}>{s.detail}</p>
          </div>
        ))}
        <p className="muted" style={{ fontSize: ".9rem", marginBottom: 0 }}>The full report lists every flagged video with its flags, an ordered fix list, and cleanup cautions — delete slowly, deletions cost watch hours.</p>
        </div>
      </div>

      <div className="honesty"><b>Straight talk:</b> {HONESTY_NOTE} Anyone who promises guaranteed monetization approval is selling you something.</div>

      <h2 id="pricing">Pricing</h2>
      <p className="section-sub">
        Every plan includes the full toolkit — audits, Pre-Publish Check, Finder, Breakdowns, Provenance Vault and Appeal Pack.
        Plans differ in credits (audit {CREDIT_COSTS.audit} · Pre-Publish {CREDIT_COSTS.prepublish} · Breakdown {CREDIT_COSTS.breakdown} · Finder {CREDIT_COSTS.finder}, cached repeats free) and monitoring.
        New accounts get +{SIGNUP_BONUS_CREDITS} bonus credits for their first 30 days once a plan is active.
      </p>
      <div className="grid grid-3">
        {PLANS.filter((p) => !p.unavailable).map((p) => (
          <div className="card feature" key={p.id} style={{ marginTop: 0, ...(p.id === "pro" ? { borderColor: "#18A999", borderWidth: 2 } : {}) }}>
            {p.id === "pro" && <span className="chip" style={{ background: "#18A999", color: "#fff", borderColor: "#18A999" }}>MOST POPULAR</span>}
            <h3 style={{ margin: "6px 0 0" }}>{p.name}</h3>
            <p style={{ margin: "4px 0" }}><b style={{ fontSize: "1.7rem", color: "#142D4C" }}>${p.price}</b><span className="muted"> /month</span></p>
            <p className="muted" style={{ marginTop: 0 }}>{p.tagline}</p>
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {p.features.map((f) => <li key={f} style={{ marginBottom: 6 }}>{f}</li>)}
            </ul>
            <Link className={`btn btn-sm ${p.id === "pro" ? "" : "btn-ghost"}`} href="/subscribe" style={{ marginTop: 10 }}>
              Get {p.name}
            </Link>
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: ".92rem" }}>
        Manual activation: send a subscription request, we reply with payment instructions, your plan switches on when payment lands — usually the same day. Nothing is ever charged automatically.
      </p>

      <h2 id="faq">Questions</h2>
      {FAQS.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p className="muted" style={{ margin: "8px 0 4px" }}>{f.a}</p>
        </details>
      ))}

      <h2>Want a guided setup?</h2>
      <div className="card">
        {state === "done" ? (
          <p className="ok" style={{ margin: 0 }}>Request received. We'll email you within a day to set up your first audit and watchlist.</p>
        ) : (
          <form onSubmit={joinWaitlist}>
            <div className="grid grid-2">
              <div className="field">
                <label htmlFor="wl-email">Email</label>
                <input id="wl-email" className="field-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="field">
                <label htmlFor="wl-channel">Channel URL <span className="muted">(optional)</span></label>
                <input id="wl-channel" className="field-input" type="text" value={channelUrl} onChange={(e) => setChannelUrl(e.target.value)} placeholder="youtube.com/@yourchannel" />
              </div>
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
            {!isSupabaseConfigured && <p className="muted">Requests opening shortly.</p>}
            <button className="btn" type="submit" disabled={state === "saving"}>{state === "saving" ? "Sending…" : "Request guided setup"}</button>
          </form>
        )}
      </div>

      <section className="cta-band">
        <h2>Your next review shouldn't be a surprise.</h2>
        <p>Run your first audit today — and let the watchlist keep score while you make videos.</p>
        <Link className="btn btn-white" href="/subscribe">Get started</Link>
      </section>

      <p className="footer-note">{PRODUCT_NAME} — a risk estimate from public signals. Only YouTube decides monetization.</p>
    </main>
  );
}
