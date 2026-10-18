"use client";
import { useEffect, useState } from "react";
import { ADMIN_EMAIL } from "@/lib/admin-policy";
import { adminAuthReturn } from "@/lib/admin-auth-return";
import styles from "./admin.module.css";
export function AdminLogin() {
  const [email, setEmail] = useState(ADMIN_EMAIL), [password, setPassword] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [sent, setSent] = useState(false);
  const [mode,setMode] = useState<"setup"|"password">("setup");
  const [emailLink,setEmailLink] = useState("");
  async function submit(action: string, extra: any = {}) {
    setBusy(true); setMessage(action === "callback" || action === "link" ? "Completing your email sign-in…" : "");
    try {
      const r = await fetch("/api/admin/auth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, email, password: action === "password" ? password : undefined, code, ...extra }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Sign-in failed.");
      if (data.authenticated) { window.location.replace("/admin"); return; }
      setSent(true); setMessage(data.message);
    } catch (e) { setMessage(e instanceof Error ? e.message : "Sign-in failed."); }
    finally { setBusy(false); setPassword(""); setEmailLink(""); }
  }
  useEffect(() => {
    const result = adminAuthReturn(window.location.search, window.location.hash);
    if (result.kind === "session" || result.kind === "token") {
      // Remove tokens from the address bar before any subsequent navigation.
      window.history.replaceState(null, "", "/admin/login");
      if(result.kind === "session") void submit("callback", { accessToken:result.accessToken, refreshToken:result.refreshToken });
      else void submit("link", { tokenHash:result.tokenHash, type:result.type });
    } else {
      if (result.kind === "error" || result.kind === "code") { setMessage("That link could not complete sign-in. Request a fresh email using the button below."); window.history.replaceState(null, "", "/admin/login"); }
      fetch("/api/admin/auth", { cache: "no-store" }).then(r => r.json()).then(d => { if (d.authenticated) window.location.replace("/admin"); else if (d.error) setMessage(d.error); }).catch(() => setMessage("Sign-in service is unavailable. Please try again shortly."));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <main className={styles.root}><section className={styles.login}>
    <p className={styles.eyebrow}>SACH SPORTS · PRIVATE ACCESS</p><h1>Administrator sign-in</h1>
    <p>{mode === "setup" ? "First access? You do not have an admin password yet. Request an email sign-in below, then set your own password inside Your account." : "Use the admin password you created inside Your account."}</p>
    <form onSubmit={e => { e.preventDefault(); void submit(mode === "setup" ? "email" : "password"); }}>
      <label>Email<input type="email" autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} required /></label>
      {mode === "password" ? <label>Password<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required /></label> : null}
      <button disabled={busy} type="submit">{busy ? "Please wait…" : mode === "setup" ? "Email me a sign-in link" : "Sign in"}</button>
    </form>
    <button disabled={busy} type="button" className={styles.secondary} onClick={() => { setMode(mode === "setup" ? "password" : "setup"); setPassword(""); setMessage(""); }}>{mode === "setup" ? "I already created an admin password" : "First access or forgot password"}</button>
    {sent ? <p className={styles.notice}>Open the newest email link from your dashboard inbox. That link completes sign-in; this page's address alone does not. Older links may have expired.</p> : null}
    <details><summary>My email includes a verification code</summary><form onSubmit={e => { e.preventDefault(); void submit("verify"); }}><label>Verification code<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" value={code} onChange={e => setCode(e.target.value)} /></label><button disabled={busy || !code}>Verify code</button></form></details>
    <details><summary>The email link will not open</summary><p>Copy the sign-in link from your newest email and paste it here. We can verify it directly without opening the broken destination. Keep this private link out of chat.</p><form onSubmit={e => { e.preventDefault(); void submit("email-link",{emailLink}); }}><label>Private email sign-in link<input type="url" autoComplete="off" spellCheck={false} value={emailLink} onChange={e => setEmailLink(e.target.value)} required /></label><button disabled={busy || !emailLink}>Complete email sign-in</button></form></details>
    {message ? <p role="status" className={styles.notice}>{message}</p> : null}
    <p>Administrator access is limited to the dashboard account. There is no public registration.</p><a href="/">Return to dashboards</a>
  </section></main>;
}
