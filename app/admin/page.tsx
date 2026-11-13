"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, isSupabaseConfigured } from "@/lib/supabaseClient";
import { PRODUCT_NAME, ADMIN_EMAILS } from "@/lib/config";

interface AdminData {
  stats: {
    totalUsers: number; newUsers7d: number;
    totalAudits: number; auditsToday: number; audits7d: number;
    totalSearches: number; searchesToday: number; searches7d: number;
    waitlistCount: number; levels: Record<string, number>;
  };
  users: { id: string; email: string; createdAt: string; lastSignInAt: string | null; audits: number; searches: number; lastActive: string | null; isAdmin: boolean }[];
  recentAudits: { id: string; channel: string; score: number; level: string; videos: number; createdAt: string; ownerEmail: string }[];
  recentSearches: { id: string; keyword: string; referenceTitle: string | null; resultCount: number; createdAt: string; ownerEmail: string }[];
  waitlist: { id: string; email: string; channel_url: string | null; role: string | null; created_at: string }[];
}

const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");
const dt = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

export default function AdminPage() {
  const [state, setState] = useState<"loading" | "signed-out" | "denied" | "error" | "ready">("loading");
  const [msg, setMsg] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [token, setToken] = useState("");

  async function load(tok: string) {
    const res = await fetch("/api/admin", { headers: { Authorization: `Bearer ${tok}` } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 403) { setState("denied"); return; }
    if (!res.ok) { setMsg(body.error ?? "Admin data failed to load."); setState("error"); return; }
    setData(body as AdminData);
    setState("ready");
  }

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) { setState("signed-out"); return; }
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { setState("signed-out"); return; }
      setToken(s.session.access_token);
      load(s.session.access_token);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function removeWaitlist(id: string) {
    const res = await fetch("/api/admin", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ waitlistId: id }),
    });
    if (res.ok && data) setData({ ...data, waitlist: data.waitlist.filter((w) => w.id !== id), stats: { ...data.stats, waitlistCount: data.stats.waitlistCount - 1 } });
  }

  const s = data?.stats;

  return (
    <main className="wrap">
      <div className="topbar">
        <Link className="logo" href="/">
          <svg className="yt-mark" width="32" height="23" viewBox="0 0 30 21" aria-hidden="true"><rect width="30" height="21" rx="5" fill="#FF0033" /><path d="M12.2 6.4l7 4.1-7 4.1z" fill="#fff" /></svg>
          {PRODUCT_NAME.replace(/ Shield$/, "")} <span>Shield</span>
        </Link>
        <div style={{ display: "flex", gap: 8 }}>
          <Link className="btn btn-ghost btn-sm" href="/dashboard">Dashboard</Link>
          <Link className="btn btn-ghost btn-sm" href="/finder">Finder</Link>
        </div>
      </div>

      <section className="page-head">
        <h1>Admin — usage</h1>
        <p>Who signed up, what they ran, and what's waiting. Visible only to admin accounts ({ADMIN_EMAILS.join(", ")}).</p>
      </section>

      {state === "loading" && <div className="card"><p className="muted" style={{ margin: 0 }}>Loading admin data…</p></div>}
      {state === "signed-out" && (
        <div className="card"><p style={{ marginTop: 0 }}>Sign in with an admin account to see usage.</p><Link className="btn" href="/login">Sign in</Link></div>
      )}
      {state === "denied" && (
        <div className="card"><p style={{ margin: 0 }}>This area is for the site admin only. You're signed in with an account that isn't on the admin list.</p></div>
      )}
      {state === "error" && <div className="card"><p className="err" style={{ margin: 0 }}>{msg}</p></div>}

      {state === "ready" && data && s && (
        <>
          <div className="clock-row" style={{ marginTop: 16 }}>
            <div className="clock"><b>{s.totalUsers}</b><span className="muted">users ({s.newUsers7d} new in 7 days)</span></div>
            <div className="clock"><b>{s.totalAudits}</b><span className="muted">audits ({s.auditsToday} today · {s.audits7d} in 7 days)</span></div>
            <div className="clock"><b>{s.totalSearches}</b><span className="muted">finder searches ({s.searchesToday} today · {s.searches7d} in 7 days)</span></div>
            <div className="clock"><b>{s.waitlistCount}</b><span className="muted">on the waitlist</span></div>
          </div>

          <div className="card">
            <h3>Audits by risk level</h3>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              {Object.entries(s.levels).map(([lvl, n]) => (
                <span key={lvl} className="chip" style={{ fontSize: ".9rem", padding: "6px 14px" }}>{lvl}: <b>{n}</b></span>
              ))}
            </div>
          </div>

          <h2>Users</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Email</th><th>Joined</th><th>Audits</th><th>Searches</th><th>Last active</th><th>Last sign-in</th></tr></thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email} {u.isAdmin && <span className="chip">admin</span>}</td>
                    <td>{d(u.createdAt)}</td>
                    <td>{u.audits}</td>
                    <td>{u.searches}</td>
                    <td>{d(u.lastActive)}</td>
                    <td>{d(u.lastSignInAt)}</td>
                  </tr>
                ))}
                {data.users.length === 0 && <tr><td colSpan={6} className="muted">No users yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <h2>Recent audits</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>When</th><th>Channel</th><th>Score</th><th>Level</th><th>Videos</th><th>Owner</th><th></th></tr></thead>
              <tbody>
                {data.recentAudits.map((a) => (
                  <tr key={a.id}>
                    <td>{dt(a.createdAt)}</td>
                    <td><b>{a.channel}</b></td>
                    <td>{a.score}</td>
                    <td>{a.level}</td>
                    <td>{a.videos}</td>
                    <td className="muted">{a.ownerEmail}</td>
                    <td><Link href={`/audit/${a.id}`}>Open</Link></td>
                  </tr>
                ))}
                {data.recentAudits.length === 0 && <tr><td colSpan={7} className="muted">No audits yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <h2>Recent Finder searches</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>When</th><th>Keyword</th><th>Reference</th><th>Channels found</th><th>Owner</th></tr></thead>
              <tbody>
                {data.recentSearches.map((r) => (
                  <tr key={r.id}>
                    <td>{dt(r.createdAt)}</td>
                    <td><b>{r.keyword || "—"}</b></td>
                    <td>{r.referenceTitle ?? "—"}</td>
                    <td>{r.resultCount}</td>
                    <td className="muted">{r.ownerEmail}</td>
                  </tr>
                ))}
                {data.recentSearches.length === 0 && <tr><td colSpan={5} className="muted">No searches yet.</td></tr>}
              </tbody>
            </table>
          </div>

          <h2>Waitlist</h2>
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Joined</th><th>Email</th><th>Channel</th><th>Role</th><th></th></tr></thead>
              <tbody>
                {data.waitlist.map((w) => (
                  <tr key={w.id}>
                    <td>{d(w.created_at)}</td>
                    <td>{w.email}</td>
                    <td>{w.channel_url ?? "—"}</td>
                    <td>{w.role ?? "—"}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => removeWaitlist(w.id)}>Remove</button></td>
                  </tr>
                ))}
                {data.waitlist.length === 0 && <tr><td colSpan={5} className="muted">Waitlist is empty.</td></tr>}
              </tbody>
            </table>
          </div>

          <p className="footer-note">Counts cover the most recent 1,000 audits and searches. Admin data is loaded server-side after verifying your account.</p>
        </>
      )}
    </main>
  );
}
