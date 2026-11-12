"use client";
import { useState } from "react";
export default function ViewerLogin(){
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");
  try{const r=await fetch("/api/viewer/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw Error(d.error||"Sign-in failed");window.location.assign("/");}
  catch(e){setMessage(e instanceof Error?e.message:"Sign-in failed");}finally{setBusy(false);}
 }
 return <main style={{maxWidth:440,margin:"8vh auto",padding:24}}><h1>Sach Sports · Private Access</h1><p>Invitation-only viewer sign-in</p><form onSubmit={submit}><label>Email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Password<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?"Signing in…":"Sign in"}</button></form>{message&&<p role="alert">{message}</p>}<p>Access is granted only by the dashboard administrator.</p></main>;
}
