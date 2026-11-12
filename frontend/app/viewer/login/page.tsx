"use client";
import { useEffect, useState } from "react";
export default function ViewerLogin(){
 const [invite,setInvite]=useState<{accessToken:string;refreshToken:string}|null>(null);
 useEffect(()=>{const hash=new URLSearchParams(window.location.hash.slice(1));const accessToken=hash.get("access_token"),refreshToken=hash.get("refresh_token");if(accessToken&&refreshToken){window.history.replaceState(null,"","/viewer/login");setInvite({accessToken,refreshToken});}},[]);
 const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");
  try{const r=await fetch("/api/viewer/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});const d=await r.json();if(!r.ok)throw Error(d.error||"Sign-in failed");window.location.assign("/");}
  catch(e){setMessage(e instanceof Error?e.message:"Sign-in failed");}finally{setBusy(false);}
 }
 async function setup(e:React.FormEvent){e.preventDefault();if(!invite)return;setBusy(true);setMessage("");
  try{const r=await fetch("/api/viewer/auth",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"setup",...invite,newPassword:password})});const d=await r.json();if(!r.ok)throw Error(d.error||"Setup failed");window.location.assign("/");}
  catch(e){setMessage(e instanceof Error?e.message:"Setup failed");}finally{setBusy(false);}
 }
 return <main style={{maxWidth:440,margin:"8vh auto",padding:24}}><h1>Sach Sports · Private Access</h1><p>{invite?"Set your password to accept your invitation":"Invitation-only viewer sign-in"}</p><form onSubmit={invite?setup:submit}>{!invite&&<label>Email<input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}/></label>}<label>{invite?"New password (12+ characters)":"Password"}<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><button disabled={busy}>{busy?"Please wait…":invite?"Accept invitation":"Sign in"}</button></form>{message&&<p role="alert">{message}</p>}<p>Access is granted only by the dashboard administrator.</p></main>;
}
