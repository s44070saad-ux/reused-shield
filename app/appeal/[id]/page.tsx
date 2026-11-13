"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase, type Audit, type ProvenanceEntry, type Deadline, deadlineDates, daysLeft } from "@/lib/supabaseClient";
import { HONESTY_NOTE } from "@/lib/config";

export default function AppealPack() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [prov, setProv] = useState<ProvenanceEntry[]>([]);
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [loading, setLoading] = useState(true);
  const [yourName, setYourName] = useState("");
  const [process, setProcess] = useState("");
  const [changes, setChanges] = useState("");

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    const sb = supabase;
    sb.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/login"); return; }
      const [a, p, d] = await Promise.all([
        sb.from("audits").select("*").eq("id", id).single(),
        sb.from("provenance_entries").select("*").eq("audit_id", id).order("created_at", { ascending: true }),
        sb.from("deadlines").select("*").order("rejection_date", { ascending: false }),
      ]);
      if (a.data) setAudit(a.data as Audit);
      if (p.data) setProv(p.data as ProvenanceEntry[]);
      if (d.data) setDeadlines(d.data as Deadline[]);
      setLoading(false);
    });
  }, [id, router]);

  const flagged = useMemo(() => audit?.videos.filter((v) => v.flags.length) ?? [], [audit]);

  const letter = useMemo(() => {
    if (!audit) return "";
    const provLines = prov.length
      ? prov.map((p) => `- ${p.video_ref} — ${p.kind}: ${p.title}${p.link ? ` (${p.link})` : ""} [saved ${new Date(p.created_at).toLocaleDateString()}]`).join("\n")
      : "(No provenance entries yet — add scripts, voiceover sources and project-file references in the Provenance Vault before submitting. Evidence is the strongest part of an appeal.)";
    return `Dear YouTube Partner Program review team,

I am appealing the monetization decision for my channel, ${audit.channel_title ?? audit.channel_input}${audit.channel_url ? ` (${audit.channel_url})` : ""}.

How our videos are made:
${process || "[Describe your real production process: who writes the scripts, how voiceover is produced, how footage is shot or licensed, and how each video is edited. Be specific and factual.]"}

What we changed after reviewing our channel:
${changes || "[List the concrete changes you actually made: titles/thumbnails diversified, boilerplate descriptions replaced, upload bursts stopped, specific videos removed or re-edited. Only claim changes you really made.]"}

Evidence of original production (timestamped records kept per video):
${provLines}

We respectfully ask for a manual re-review of the channel. We are happy to provide project files, scripts or voiceover recordings for any specific video on request.

Thank you for your time,
${yourName || "[Your name]"}`;
  }, [audit, prov, process, changes, yourName]);

  function downloadPack() {
    if (!audit) return;
    const md = `# Appeal Pack — ${audit.channel_title ?? audit.channel_input}
Generated: ${new Date().toLocaleString()}
Channel: ${audit.channel_url ?? ""}
Audit risk score (public-signal estimate): ${audit.score}/100 (${audit.level}) — ${HONESTY_NOTE}

## Audit reasons
${audit.reasons.map((r) => `- ${r}`).join("\n") || "- None recorded"}

## Fix list
${audit.fixes.map((f, i) => `${i + 1}. ${f}`).join("\n")}

## Flagged videos
${flagged.map((v) => `- ${v.title} (${v.id}) — ${v.flags.join(", ")}`).join("\n") || "- No per-video flags"}

## Provenance evidence
${prov.map((p) => `- [${new Date(p.created_at).toLocaleString()}] ${p.video_ref} — ${p.kind}: ${p.title}${p.detail ? ` — ${p.detail}` : ""}${p.link ? ` — ${p.link}` : ""}`).join("\n") || "- None yet"}

## Appeal letter (draft — edit before submitting)
${letter}
`;
    const blob = new Blob([md], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `appeal-pack-${(audit.channel_title ?? "channel").replace(/[^\w\- ]/g, "").replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loading) return <main className="wrap"><p className="muted" style={{ paddingTop: 40 }}>Building your pack…</p></main>;
  if (!audit) return <main className="wrap"><div className="card"><p className="err">Audit not found.</p><Link className="btn btn-sm" href="/dashboard">Back to dashboard</Link></div></main>;

  const fmt = (x: Date) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <main className="wrap">
      <div className="topbar no-print">
        <Link className="logo" href={`/audit/${audit.id}`}>← Report</Link>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => window.print()}>Print / save as PDF</button>
          <button className="btn btn-sm" onClick={downloadPack}>Download pack (.md)</button>
        </div>
      </div>

      <h1 style={{ fontSize: "1.9rem" }}>Appeal Pack — {audit.channel_title ?? audit.channel_input}</h1>
      <div className="honesty no-print"><b>Before you submit:</b> only claim what is true. This pack assembles YOUR audit and YOUR evidence into a factual draft — you edit it, you check it, you send it. {HONESTY_NOTE}</div>

      {deadlines.length > 0 ? (
        <>
          <h2>Your clocks</h2>
          {deadlines.map((d) => {
            const { appealBy, reapplyBy } = deadlineDates(d);
            return (
              <div className="card" key={d.id} style={{ marginTop: 10 }}>
                <b>{d.channel_title}</b> — rejected {fmt(new Date(d.rejection_date + "T00:00:00Z"))}
                <div className="clock-row" style={{ marginTop: 10 }}>
                  <div className="clock"><b>{daysLeft(appealBy)} days</b><span className="muted">left to appeal — {fmt(appealBy)}</span></div>
                  <div className="clock"><b>{fmt(reapplyBy)}</b><span className="muted">earliest reapply date</span></div>
                </div>
              </div>
            );
          })}
        </>
      ) : (
        <div className="card"><p className="muted" style={{ margin: 0 }}>No rejection tracked yet. Add the rejection date on your <Link href="/dashboard">dashboard</Link> and your 21-day appeal clock will appear here.</p></div>
      )}

      <h2>1 · The audit (summary)</h2>
      <div className="card" style={{ marginTop: 0 }}>
        <p style={{ marginTop: 0 }}>Risk estimate from public signals: <b>{audit.score}/100 ({audit.level})</b> · {audit.video_count_sampled} videos sampled · {new Date(audit.created_at).toLocaleDateString()}</p>
        <ul style={{ margin: 0, paddingLeft: 20 }}>{audit.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
      </div>

      <h2>2 · Provenance per flagged video</h2>
      <div className="card" style={{ marginTop: 0 }}>
        {flagged.length === 0 && <p className="muted" style={{ margin: 0 }}>No videos were flagged in this audit.</p>}
        {flagged.map((v) => (
          <div key={v.id} style={{ marginBottom: 14 }}>
            <b>{v.title}</b> <span className="muted">({v.flags.join(", ")})</span>
            {prov.filter((p) => p.video_ref.toLowerCase().includes(v.id.toLowerCase()) || v.title.toLowerCase().includes(p.video_ref.toLowerCase().slice(0, 24))).length ? (
              <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                {prov.filter((p) => p.video_ref.toLowerCase().includes(v.id.toLowerCase()) || v.title.toLowerCase().includes(p.video_ref.toLowerCase().slice(0, 24))).map((p) => (
                  <li key={p.id}>{p.kind}: {p.title} — saved {new Date(p.created_at).toLocaleString()}{p.link ? <> · <a href={p.link} target="_blank" rel="noreferrer">evidence link</a></> : null}</li>
                ))}
              </ul>
            ) : <p className="muted" style={{ margin: "4px 0 0" }}>No provenance stored for this video yet — add it from the audit report page.</p>}
          </div>
        ))}
        {prov.length > 0 && (
          <>
            <h3 style={{ marginTop: 18 }}>All provenance entries for this channel ({prov.length})</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {prov.map((p) => <li key={p.id}>{p.video_ref} — {p.kind}: {p.title} [{new Date(p.created_at).toLocaleString()}]</li>)}
            </ul>
          </>
        )}
      </div>

      <h2>3 · Appeal letter builder</h2>
      <div className="card no-print" style={{ marginTop: 0 }}>
        <div className="field">
          <label htmlFor="ap-name">Your name</label>
          <input id="ap-name" className="field-input" value={yourName} onChange={(e) => setYourName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ap-process">How your videos are actually made</label>
          <textarea id="ap-process" className="field-input" value={process} onChange={(e) => setProcess(e.target.value)} placeholder="Who writes, who voices, where footage comes from, how editing works…" />
        </div>
        <div className="field">
          <label htmlFor="ap-changes">What you changed after the rejection</label>
          <textarea id="ap-changes" className="field-input" value={changes} onChange={(e) => setChanges(e.target.value)} placeholder="Only real changes — reviewers can check." />
        </div>
      </div>
      <div className="card" style={{ marginTop: 12 }}>
        <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: 0, fontSize: ".96rem" }}>{letter}</pre>
      </div>
    </main>
  );
}
