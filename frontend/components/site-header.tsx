"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useState} from "react";
import {DASHBOARD_SPORTS,type DashboardSport} from "@/lib/dashboard-contract";
import {fetchDashboardSummary} from "./use-dashboard-summary";
export function SiteHeader(){
 const pathname=usePathname(),active=pathname.split("/")[1];
 const [menu,setMenu]=useState(false),[search,setSearch]=useState(false),[query,setQuery]=useState("");
 const [results,setResults]=useState<{sport:DashboardSport;name:string;team:string}[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{setMenu(false);setSearch(false)},[pathname]);
 useEffect(()=>{let live=true;const q=query.trim().toLowerCase();if(!search||q.length<2){setResults([]);setBusy(false);return}
  const timer=setTimeout(async()=>{setBusy(true);const found:typeof results=[];for(let i=0;i<DASHBOARD_SPORTS.length;i+=3){await Promise.all(DASHBOARD_SPORTS.slice(i,i+3).map(async sport=>{try{const d=await fetchDashboardSummary(sport);for(const r of d.verifiedRows||[])if(String(r.playerName||r.name||"").toLowerCase().includes(q))found.push({sport,name:r.playerName||r.name,team:r.teamName||r.team||""})}catch{}}));}if(live){setResults(found.slice(0,20));setBusy(false)}},300);return()=>{live=false;clearTimeout(timer)};
 },[search,query]);
 return <header className="ssSiteHeader">
  <div className="ssSiteBrandRow"><Link className="ssSiteBrand" href="/" aria-label="Go to Sach Sports homepage"><img src="/brand/sach-sports-crown-logo.png" width="64" height="64" alt=""/><span><b>SACH</b> SPORTS</span></Link><div className="ssSiteActions"><button aria-label="Search players" aria-expanded={search} onClick={()=>{setSearch(!search);setMenu(false)}}>⌕</button><button aria-label="Open navigation menu" aria-expanded={menu} onClick={()=>{setMenu(!menu);setSearch(false)}}>☰</button></div></div>
  <nav className="ssSiteNav" aria-label="Sports dashboards"><Link href="/" className={!active?"active":""} aria-current={!active?"page":undefined}>HOME</Link>{DASHBOARD_SPORTS.map(s=><Link href={`/${s}`} key={s} prefetch={false} className={active===s?"active":""} aria-current={active===s?"page":undefined}>{s==="soccer"?"Soccer":s.toUpperCase()}</Link>)}</nav>
  {menu?<div className="ssSiteMenu"><Link href="/">Home</Link>{DASHBOARD_SPORTS.map(s=><Link key={s} href={`/${s}`}>{s.toUpperCase()} dashboard ›</Link>)}</div>:null}
  {search?<section className="ssSiteSearch"><label htmlFor="ss-player-search">Search current verified player props</label><div><input id="ss-player-search" type="search" placeholder="Player name…" value={query} onChange={e=>setQuery(e.target.value)}/><button aria-label="Close search" onClick={()=>setSearch(false)}>✕</button></div>{busy?<p>Searching…</p>:query.trim().length<2?<p>Enter at least two letters.</p>:results.length?results.map((r,i)=><Link key={`${r.sport}|${r.name}|${i}`} href={`/${r.sport}?player=${encodeURIComponent(r.name)}`}><strong>{r.name}</strong><span>{r.sport.toUpperCase()} · {r.team}</span></Link>):<p>No matching player in the current verified boards.</p>}</section>:null}
 </header>;
}
