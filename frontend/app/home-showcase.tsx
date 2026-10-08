"use client";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import "./home-showcase.css";

type Game={id:string;date:string;awayAbbr:string;homeAbbr:string;awayLogo?:string|null;homeLogo?:string|null;awayRecord?:string;homeRecord?:string;state:"pre"|"in"|"post";status:string;awayScore?:string|number|null;homeScore?:string|number|null};
type Sport="nfl"|"cfb"|"nba"|"wnba"|"nhl";
type Item=Game&{sport:Sport};
type Prediction={playerName:string;headshot?:string;market:string;line:number;gi:number;team?:string;status?:string};
function MetricIcon({kind}:{kind:"games"|"props"|"predictions"|"hit"}){const common={width:28,height:28,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:1.8,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,"aria-hidden":true};if(kind==="games")return <svg {...common}><rect x="3" y="6" width="18" height="12" rx="4"/><path d="M8 10v5M5.5 12.5h5M16.5 11h.01M19 14h.01"/></svg>;if(kind==="props")return <svg {...common}><circle cx="9" cy="8" r="3"/><path d="M2.5 20v-2a6.5 6.5 0 0 1 13 0v2M17 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3.5 5v1"/></svg>;if(kind==="predictions")return <svg {...common}><rect x="3" y="13" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="13" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>;return <svg {...common}><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/><path d="m12 12 7-7M17 5h2v2"/></svg>}
const SPORTS:{slug:Sport;name:string;icon:string}[]=[{slug:"nfl",name:"NFL",icon:"🏈"},{slug:"nhl",name:"NHL",icon:"🏒"},{slug:"nba",name:"NBA",icon:"🏀"},{slug:"cfb",name:"CFB",icon:"🏈"},{slug:"wnba",name:"WNBA",icon:"🏀"}];
const localDay=(d:Date)=>{const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const get=(t:string)=>parts.find(p=>p.type===t)?.value||"";return get("year")+"-"+get("month")+"-"+get("day")};
const dateLabel=(d:string)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",month:"short",day:"numeric"}).format(new Date(d));
const timeLabel=(d:string)=>new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",hour:"numeric",minute:"2-digit"}).format(new Date(d))+" ET";
export default function HomeShowcase(){
 const [expanded,setExpanded]=useState(false);
 const [games,setGames]=useState<Item[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [failed,setFailed]=useState(0);
 const [predictions,setPredictions]=useState<Prediction[]>([]);
 const [rankingLoaded,setRankingLoaded]=useState(false);
 const [menuOpen,setMenuOpen]=useState(false);
 useEffect(()=>{let live=true;Promise.all(SPORTS.map(async s=>{try{const r=await fetch("/api/game-slate?sport="+s.slug,{cache:"no-store"});if(!r.ok)throw Error("unavailable");const d=await r.json();return {items:(Array.isArray(d.games)?d.games:[]).map((g:Game)=>({...g,sport:s.slug})),failed:false};}catch{return {items:[] as Item[],failed:true};}})).then(results=>{if(live){setGames(results.flatMap(r=>r.items));setFailed(results.filter(r=>r.failed).length);setLoaded(true);}});return()=>{live=false};},[]);
 useEffect(()=>{let active=true;Promise.all(["passing_yards","receiving_yards","rushing_yards"].map(async market=>{try{const r=await fetch("/api/nfl/rankings?market="+market,{cache:"no-store"});if(!r.ok)return [];const d=await r.json();return (Array.isArray(d.rows)?d.rows:[]).filter((p:any)=>p.marketBacked!==false&&Number.isFinite(Number(p.giScore))&&p.playerName).slice(0,8).map((p:any)=>({playerName:String(p.playerName),headshot:String(p.headshot||""),market:market.replaceAll("_"," "),line:Number(p.sportsbookLine),gi:Number(p.giScore),team:String(p.teamName||""),status:String(p.resultStatus||"")}));}catch{return []}})).then(all=>{if(active){setPredictions(all.flat().filter(p=>Number.isFinite(p.line)&&p.line>0).sort((a,b)=>b.gi-a.gi).slice(0,3));setRankingLoaded(true)}});return()=>{active=false}},[]);
 const today=localDay(new Date());
 const todays=useMemo(()=>games.filter(g=>{try{return localDay(new Date(g.date))===today}catch{return false}}),[games,today]);
 const ordered=useMemo(()=>{const selected=SPORTS.slice(0,expanded?5:3);return selected.map(s=>todays.filter(g=>g.sport===s.slug).sort((a,b)=>({in:0,pre:1,post:2}[a.state]-{in:0,pre:1,post:2}[b.state])||Date.parse(a.date)-Date.parse(b.date))[0]).filter((g):g is Item=>Boolean(g))},[todays,expanded]);
 const live=todays.filter(g=>g.state==="in").length;
 const upcoming=todays.filter(g=>g.state==="pre").length;
 return <main className="shRoot"><div className="shWrap">
  <header className="shHeader"><Link href="/" className="shBrand"><Image src="/brand/sach-sports-crown-logo.png" alt="Sach Sports crowned S" width={80} height={80} priority/><span><b>SACH</b> SPORTS</span></Link><div className="shHeaderIcons"><button type="button" onClick={()=>setMenuOpen(v=>!v)} aria-expanded={menuOpen} aria-label="Toggle sports menu">☰</button></div></header>
  <nav className={"shNav"+(menuOpen?" shNavOpen":"")} aria-label="Main navigation"><Link className="shSelected" href="/">HOME</Link>{SPORTS.map(s=><Link key={s.slug} href={"/"+s.slug}>{s.name}</Link>)}</nav>
  <section className="shHero"><div className="shHeroContent"><h1>YOUR <em>GAME.</em><br/>OUR INTELLIGENCE.</h1><p>Player data <i>•</i> Game context <i>•</i> Smarter predictions</p></div><div className="shHeroArtwork" aria-hidden="true" /></section>
  <section className="shCenters"><div className="shSectionTitle"><h2>ACTIVE INTELLIGENCE CENTERS</h2><button onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?"SHOW LESS":"VIEW ALL"} <span>→</span></button></div><div className="shSportGrid">{SPORTS.slice(0,expanded?5:3).map(s=><Link className={"shSportCard shSport-"+s.slug} href={"/"+s.slug} key={s.slug}><div className="shSportIcon" aria-hidden="true" /><div className="shSportBottom"><strong>{s.name}</strong></div><span className="shCircleArrow">›</span></Link>)}</div></section>
  <section className="shIntel"><div className="shIntelTitle"><h2>TODAY’S INTELLIGENCE</h2><span>▦ &nbsp;{new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",weekday:"short",month:"short",day:"numeric",year:"numeric"}).format(new Date())}</span></div><div className="shStats">
   <div><span className="shStatHead"><b><MetricIcon kind="games"/></b> GAMES</span><strong>{loaded?todays.length:"…"}</strong><small>{loaded&&failed===0?live+" live · "+upcoming+" upcoming":"Checking league slates"}</small></div>
   <div><span className="shStatHead"><b><MetricIcon kind="props"/></b> PLAYER PROPS</span><strong>{rankingLoaded?predictions.length:"…"}</strong><small>{rankingLoaded?"Featured NFL props":"Loading props"}</small></div>
   <div><span className="shStatHead"><b><MetricIcon kind="predictions"/></b> PREDICTIONS</span><strong>{rankingLoaded?predictions.length:"—"}</strong><small>{rankingLoaded?"Featured predictions":"Loading predictions"}</small></div>
   <div><span className="shStatHead"><b><MetricIcon kind="hit"/></b> HIT RATE</span><strong className="shPendingMetric">Pending</strong><small>No settled predictions yet</small></div>
  </div></section>
  <div className="shBottomGrid">
   <section className="shBottomSection"><div className="shSectionTitle"><h2>TODAY’S GAMES</h2><Link href="/nfl" aria-label="Open NFL games">→</Link></div><div className="shPanel"><div className="shGameList">{ordered.length?ordered.map(g=><Link href={"/"+g.sport} className="shGame" key={g.sport+g.id}><div className="shTeam">{g.awayLogo?<img src={g.awayLogo} alt=""/>:<span>◉</span>}<b>{g.awayAbbr}</b><small>{g.awayRecord||""}</small></div><span className="shAt">@</span><div className="shTeam">{g.homeLogo?<img src={g.homeLogo} alt=""/>:<span>◉</span>}<b>{g.homeAbbr}</b><small>{g.homeRecord||""}</small></div><div className="shWhen"><b>{dateLabel(g.date)}</b><span>{g.state==="pre"?timeLabel(g.date):g.state==="in"?g.status:"Final"}</span></div></Link>):<div className="shEmpty">{!loaded?"Loading today’s matchups…":failed===SPORTS.length?"Game feeds are temporarily unavailable.":"No scheduled matchups to display today."}</div>}</div><Link className="shPanelAction" href="/nfl">View Full Game Slate &nbsp; →</Link></div></section>
   <section className="shBottomSection"><div className="shSectionTitle"><h2>TOP PREDICTIONS TODAY</h2><Link href="/nfl" aria-label="Open player rankings">→</Link></div><div className="shPanel"><div className="shPredList">{predictions.length?predictions.map((p,i)=><Link className="shPredictionRow" href="/nfl" key={p.playerName+p.market+i}>{p.headshot?<img src={p.headshot} alt="" loading="lazy"/>:<span className="shPlayerFallback">◉</span>}<span className="shPlayerDetails"><strong>{p.playerName}</strong><small>{p.market}</small><small>O/U {p.line}</small></span><span className="shPlayerGI"><small>GI</small>{Math.round(p.gi)}</span></Link>):<div className="shPredictionEmpty"><span className="shGI">GI</span><strong>{rankingLoaded?"No verified predictions available":"Loading player intelligence"}</strong><p>{rankingLoaded?"Player rankings are available in each intelligence center.":"Checking the existing NFL prediction engine."}</p></div>}</div><Link className="shPanelAction" href="/nfl">View All Player Rankings &nbsp; →</Link></div></section>
  </div>
  <footer className="shFooter">© SACH SPORTS · THE INTELLIGENCE EDGE</footer>
 </div></main>;
}
