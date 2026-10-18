"use client";
import { useEffect, useState } from "react";
import { ADMIN_EMAIL } from "@/lib/admin-policy";
import styles from "./admin.module.css";
export function AdminLogin() {
  const [email, setEmail] = useState(ADMIN_EMAIL), [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [sent, setSent] = useState(false);
  async function submit(action: string, extra: any = {}) {
    setBusy(true); setMessage("");
    try {
      const r = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, password: action === "password" ? password : undefined, code, ...extra }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Sign-in failed.");
      if (data.authenticated) { window.location.replace("/admin"); return; }
      setSent(true); setMessage(data.message);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setBusy(false); setPassword(""); }
  }
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = params.get("access_token"), refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      // Remove tokens from the address bar before any subsequent navigation.
      window.history.replaceState(null, "", "/admin/login");
      void submit("callback", { accessToken, refreshToken });
    } else {
      if (params.has("error_description")) { setMessage("That email link has expired. Request a new sign-in email."); window.history.replaceState(null, "", "/admin/login"); }
      fetch("/api/admin/auth", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.authenticated) window.location.replace("/admin"); else if (d.error) setMessage(d.error); }).catch(() => setMessage("Sign-in service is unavailable. Please try again shortly."));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <main className={styles.root}><section className={styles.login}>
    <p className={styles.eyebrow}>SACH SPORTS · PRIVATE ACCESS</p><h1>Administrator sign-in</h1>
    <p>Inspect results, capture status and the evidence behind the dashboard.</p>
    <form onSubmit={e => { e.preventDefault(); void submit("password"); }}>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label>
      <button disabled={busy} type="submit">{busy ? "Please wait…" : "Sign in"}</button>
    </form>
    <button disabled={busy} type="button" className={styles.secondary} onClick={() => void submit("email")}>First sign-in or forgot password? Email me a sign-in link</button>
    {sent ? <form onSubmit={e => { e.preventDefault(); void submit("verify"); }}><label>Verification code, if included in your email<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" value={code} onChange={e => setCode(e.target.value)} /></label><button disabled={busy || !code}>Verify code</button><p>You can also open the sign-in link in the email.</p></form> : null}
    {message ? <p role="status" className={styles.notice}>{message}</p> : null}
    <p>Administrator access is limited to the dashboard account. There is no public registration.</p><a href="/">Return to dashboards</a>
  </section></main>;
}
