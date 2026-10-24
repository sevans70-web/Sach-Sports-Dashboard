"use client";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {VISIBLE_SPORTS,type DashboardSport} from "@/lib/dashboard-contract";
import type {SearchPlayer} from "@/lib/player-search";
export function SiteHeader(){
 const pathname=usePathname(),active=pathname.split("/")[1];
 useEffect(()=>{for(const sport of VISIBLE_SPORTS){const image=new Image();image.src=`/hero/${sport}.webp`}},[]);
 const [menu,setMenu]=useState(false),[search,setSearch]=useState(false),[query,setQuery]=useState("");
 const [results,setResults]=useState<SearchPlayer[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(""),[partial,setPartial]=useState(false),[limited,setLimited]=useState(false);
 useEffect(()=>{setMenu(false);setSearch(false)},[pathname]);
 useEffect(()=>{
  const q=query.trim();setResults([]);setError("");setPartial(false);setLimited(false);
  if(!search||q.length<2){setBusy(false);return;}
  const controller=new AbortController();setBusy(true);
  const timer=setTimeout(async()=>{try{
   const response=await fetch(`/api/player-search?q=${encodeURIComponent(q)}`,{signal:controller.signal});const data=await response.json();
   if(!response.ok||!data.success)throw Error(data.error||"Player search is temporarily unavailable. Please try again.");
   if(!controller.signal.aborted){setResults(data.players||[]);setPartial(!!data.partial);setLimited(!!data.limited);}
  }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:"Player search is temporarily unavailable. Please try again.");}
  finally{if(!controller.signal.aborted)setBusy(false);}},300);
  return()=>{controller.abort();clearTimeout(timer)};
 },[search,query]);
 return <header className="ssSiteHeader">
  <div className="ssSiteBrandRow"><Link className="ssSiteBrand" href="/" aria-label="Go to Sach Sports homepage"><img src="/brand/sach-sports-crown-logo.png" width="64" height="64" alt=""/><span><b>SACH</b> SPORTS</span></Link><div className="ssSiteActions"><button aria-label="Search players" aria-expanded={search} onClick={()=>{setSearch(!search);setMenu(false)}}>⌕</button><button aria-label="Open navigation menu" aria-expanded={menu} onClick={()=>{setMenu(!menu);setSearch(false)}}>☰</button></div></div>
  <nav className="ssSiteNav" aria-label="Sports dashboards"><Link href="/" className={!active?"active":""} aria-current={!active?"page":undefined}>HOME</Link>{VISIBLE_SPORTS.map(s=><Link href={`/${s}`} key={s} className={active===s?"active":""} aria-current={active===s?"page":undefined}>{s==="soccer"?"Soccer":s.toUpperCase()}</Link>)}</nav>
  {menu?<div className="ssSiteMenu"><Link href="/">Home</Link>{VISIBLE_SPORTS.map(s=><Link key={s} href={`/${s}`}>{s.toUpperCase()} dashboard ›</Link>)}<Link href={`/performance?sport=${VISIBLE_SPORTS.includes(active as DashboardSport)?active:"nba"}`}>Prediction Performance ›</Link><Link href="/admin">Administrator sign-in ›</Link></div>:null}
  {search?<section className="ssSiteSearch" aria-label="Player search"><label htmlFor="ss-player-search">Search players across all sports</label><div><input id="ss-player-search" type="search" autoFocus autoComplete="off" placeholder="Player name…" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="Close search" onClick={()=>setSearch(false)}>✕</button></div>
   <p role="status" aria-live="polite">{busy?"Searching…":error?error:query.trim().length<2?"Enter at least two letters.":results.length?`${results.length} player${results.length===1?"":"s"} found`:partial?"Some player results are temporarily unavailable. Please try again.":"No matching players found. Try a first or last name."}</p>
   {!busy&&!error?<ul className="ssSearchResults">{results.map(r=><li key={`${r.sport}:${r.id}`}><a href={r.href} onClick={()=>setSearch(false)}><strong>{r.name}</strong><span>{r.sport.toUpperCase()}{r.team?` · ${r.team}`:""}</span></a></li>)}</ul>:null}
   {!busy&&results.length&&partial?<p>Some player results are temporarily unavailable.</p>:null}
   {!busy&&limited?<p>Keep typing to narrow the results.</p>:null}
  </section>:null}
 </header>;
}
import {SportLink as Link} from "./sport-link";
