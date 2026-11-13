"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { PRODUCT_NAME } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase?.auth.getSession().then(({ data }) => { if (data.session) router.replace("/dashboard"); });
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) { setErr("Accounts are not connected yet — try again shortly."); return; }
    setBusy(true); setErr(""); setInfo("");
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
      if (error) { setErr(error.message); setBusy(false); return; }
      if (data.session) { router.replace("/dashboard"); return; }
      setInfo("Account created. If email confirmation is on, confirm from your inbox, then sign in.");
      setMode("signin"); setBusy(false);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) { setErr(error.message); setBusy(false); return; }
      router.replace("/dashboard");
    }
  }

  return (
    <main className="wrap" style={{ maxWidth: 520 }}>
      <div className="topbar">
        <Link className="logo" href="/"><svg className="yt-mark" width="32" height="23" viewBox="0 0 30 21" aria-hidden="true"><rect width="30" height="21" rx="5" fill="#FF0033"/><path d="M12.2 6.4l7 4.1-7 4.1z" fill="#fff"/></svg>{PRODUCT_NAME.replace(/ Shield$/, "")} <span>Shield</span></Link>
        <Link className="btn btn-ghost btn-sm" href="/">Home</Link>
      </div>
      <h1 style={{ fontSize: "1.9rem" }}>{mode === "signin" ? "Sign in" : "Create your account"}</h1>
      <p className="muted">Free beta. Your audits and provenance entries are private to your account.</p>
      <div className="card">
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="field-input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" className="field-input" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          {err && <p className="err">{err}</p>}
          {info && <p className="ok">{info}</p>}
          <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <p className="muted" style={{ marginBottom: 0 }}>
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <a href="#" onClick={(e) => { e.preventDefault(); setMode(mode === "signin" ? "signup" : "signin"); setErr(""); setInfo(""); }}>
            {mode === "signin" ? "Create an account" : "Sign in"}
          </a>
        </p>
      </div>
    </main>
  );
}
