"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import {CFB_MARKETS,type CfbMarketKey} from "@/lib/cfb";

type P={key:string;playerName:string;teamName:string;matchup:string;gameTime:string;market:CfbMarketKey;rank?:number;sportsbookLine:number|null;modelProjection:number|null;modelProbability:number|null;status:string;actual:number|null};
const WINDOWS=["12 PM","Afternoon","Evening"];
export default function CfbResultsPage(){
 const[windowName,setWindowName]=useState("12 PM"),[rows,setRows]=useState<P[]>([]),[loading,setLoading]=useState(true);
 useEffect(()=>{let active=true;setLoading(true);Promise.all(CFB_MARKETS.map(async([market])=>{try{const r=await fetch(`/api/cfb/performance?period=Today&market=${market}&window=${encodeURIComponent(windowName)}`,{cache:"no-store"});const j=await r.json();return Array.isArray(j.predictions)?j.predictions:[]}catch{return []}})).then(parts=>{if(active)setRows(parts.flat().sort((a,b)=>(a.gameTime||"").localeCompare(b.gameTime||"")||(a.rank||99)-(b.rank||99)))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[windowName]);
 return <main style={{maxWidth:1000,margin:"0 auto",padding:"24px",color:"#f5f5f5"}}><Link href="/cfb">← Back to CFB</Link><h1>Saturday Predictions / Results</h1><p>Frozen kickoff predictions remain here after the active Top 25 rolls forward to later games.</p><div style={{display:"flex",gap:8,overflowX:"auto",margin:"18px 0"}}>{WINDOWS.map(w=><button key={w} onClick={()=>setWindowName(w)} style={{padding:"10px 16px",borderRadius:10,border:w===windowName?"2px solid #e84d68":"1px solid #555",background:"#11151b",color:"white",whiteSpace:"nowrap"}}>{w}</button>)}</div>{loading?<p>Loading saved predictions…</p>:rows.length===0?<p>No saved predictions in this window yet.</p>:rows.map(p=><article key={p.key} style={{border:"1px solid #3a414d",borderRadius:14,padding:14,margin:"10px 0",background:"#11151b"}}><b>#{p.rank||"—"} {p.playerName}</b><div>{p.teamName} · {CFB_MARKETS.find(x=>x[0]===p.market)?.[2]||p.market}</div><div>{p.matchup}</div><div>Prediction: {p.modelProjection??"—"} · Line: {p.sportsbookLine??"—"} · Actual: {p.actual??"—"}</div><strong>{p.status==="hit"?"✅ HIT":p.status==="miss"?"❌ MISS":p.status==="push"?"➖ PUSH":p.status==="void"?"VOID":"⏳ PENDING"}</strong></article>)}</main>
}
