"use client";
import {SportLink as Link} from "@/components/sport-link";
import {useEffect,useState} from "react";
import {VISIBLE_SPORTS,dashboardDay,featuredDashboardGames,type DashboardSport} from "@/lib/dashboard-contract";
import {cardModelPick} from '@/lib/saved-model-pick';
import {fetchDashboardSummary} from "@/components/use-dashboard-summary";
import "./home-showcase.css";
const CENTERS:DashboardSport[]=["nfl","nhl","nba","cfb","wnba","cbb"];
function label(s:string){return s==="soccer"?"Soccer":s.toUpperCase()}
function when(value:string){const d=new Date(value);return Number.isFinite(d.getTime())?new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(d)+" ET":"Time TBD"}
export default function HomeShowcase(){
 const [expanded,setExpanded]=useState(false),[summaries,setSummaries]=useState<Record<string,any>>({}),[loaded,setLoaded]=useState(false),[performance,setPerformance]=useState<any>(null);
 useEffect(()=>{let live=true,running=false;const run=async()=>{if(running)return;running=true;try{await Promise.all(VISIBLE_SPORTS.map(async sport=>{try{const d=await fetchDashboardSummary(sport);if(live)setSummaries(s=>({...s,[sport]:d}))}catch{if(live)setSummaries(s=>({...s,[sport]:{sport,success:false}}))}}));if(live)setLoaded(true)}finally{running=false}};run();const id=setInterval(run,30_000);const grade=()=>fetch("/api/platform-performance",{cache:"no-store"}).then(r=>r.json()).then(d=>{if(live)setPerformance(d)}).catch(()=>{});grade();const grades=setInterval(grade,60_000);return()=>{live=false;clearInterval(id);clearInterval(grades)}},[]);
 const available=Object.values(summaries),games=available.flatMap(d=>(d.previewGames||[]).map((g:any)=>({...g,sport:d.sport}))),predictions=available.flatMap(d=>(d.modelPickRows||[]).filter((r:any)=>cardModelPick(r)).map((r:any)=>({...r,sport:d.sport,market:d.market,pick:cardModelPick(r)})));
 const [today,setToday]=useState("");
 useEffect(()=>{const update=()=>setToday(dashboardDay(new Date()));update();const id=setInterval(update,60_000);return()=>clearInterval(id)},[]);
 const allReady=loaded&&available.every(d=>d.scheduleAvailable&&d.rankingsAvailable);
 const total=(field:string)=>available.reduce((n,d)=>n+(Number(d[field])||0),0);
 const featured=[...predictions].sort((a,b)=>Date.parse(a.gameTime)-Date.parse(b.gameTime)).slice(0,3);
 const ordered=featuredDashboardGames(games);
 return <main className="shRoot"><div className="shWrap">
  <section className="shHero"><div className="shHeroContent"><h1>YOUR <em>GAME.</em><br/>OUR INTELLIGENCE.</h1><p>Player data <i>•</i> Game context <i>•</i> Smarter predictions</p></div><div className="shHeroArtwork" aria-hidden="true"><span className="shHeroAthlete shHeroFootball"/><span className="shHeroAthlete shHeroBasketball"/><span className="shHeroAthlete shHeroHockey"/></div></section>
  <section className="shCenters"><div className="shSectionTitle"><h2>ACTIVE INTELLIGENCE CENTERS</h2><button onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>{expanded?"SHOW LESS":"VIEW ALL"} →</button></div><div className="shSportGrid">{CENTERS.slice(0,expanded?CENTERS.length:3).map(s=><Link className={"shSportCard shSport-"+s} href={"/"+s} key={s}><div className="shSportBottom"><strong>{label(s)}</strong></div><span className="shCircleArrow">›</span></Link>)}</div></section>
  <section className="shIntel"><div className="shIntelTitle"><h2>CURRENT SLATE INTELLIGENCE</h2><span>{today}</span></div><div className="shStats">
   <div><span className="shStatHead">GAMES</span><strong>{available.length?total("games"):"…"}</strong><small>{total("live")} live</small></div>
   <div><span className="shStatHead">PLAYER PROPS</span><strong>{available.length?total("playerProps"):"…"}</strong><small>Verified book lines · featured markets</small></div>
   <div><span className="shStatHead">SACH PICKS</span><strong>{available.length?total("estimatedPicks"):"…"}</strong><small>Model estimates · featured markets</small></div>
   <div><span className="shStatHead">HIT RATE</span><strong>{performance?.settled?performance.hitRate+"%":"—"}</strong><small>{performance?.settled?(performance.partial?"Partial · ":"")+performance.hits+" / "+performance.settled+" settled today":performance?.success?"No settled predictions today":"Checking settled results"}</small></div>
  </div>{loaded&&!allReady?<p className="ssScopeNote">Some feeds are unavailable; totals are partial.</p>:null}</section>
  <section className="shPanel"><div className="shSectionTitle"><h2>SPORT SNAPSHOTS</h2></div><div className="ssHomeSportSummary">{VISIBLE_SPORTS.map(s=><Link href={"/"+s} key={s}><strong>{label(s)}</strong><span>{summaries[s]?.scheduleAvailable?summaries[s].games+" games":"Schedule loading"}</span><span>{summaries[s]?.rankingsAvailable?summaries[s].estimatedPicks+" model picks":"Picks loading"}</span></Link>)}</div></section>
  <div className="shBottomGrid"><section className="shBottomSection"><div className="shPanel"><div className="shSectionTitle shPanelHeading"><h2>CURRENT + NEXT GAMES</h2></div><div className="shGameList">{ordered.map((g:any)=><Link href={"/"+g.sport+"/games"} className="shGame" key={g.sport+"|"+g.id}><div className="shTeam">{g.awayLogo?<img src={g.awayLogo} alt=""/>:null}<b>{g.awayAbbr}</b></div><span className="shAt">@</span><div className="shTeam">{g.homeLogo?<img src={g.homeLogo} alt=""/>:null}<b>{g.homeAbbr}</b></div><div className="shWhen"><b>{label(g.sport)}</b><span>{when(g.date)}</span><small>{g.state==="pre"?"Scheduled":g.status}</small></div></Link>)}{!ordered.length?<p>{loaded?"No games in the available schedule windows":"Loading current slates…"}</p>:null}</div></div></section>
  <section className="shBottomSection"><div className="shPanel"><div className="shSectionTitle shPanelHeading"><h2>CURRENT SACH PICKS</h2></div><div className="shPredList">{featured.map((p:any,i)=><Link className="shPredictionRow" href={"/"+p.sport} key={p.sport+"|"+p.playerId+"|"+i}>{p.headshot||p.photoUrl?<img src={p.headshot||p.photoUrl} alt=""/>:<span className="shPlayerFallback">{label(p.sport)}</span>}<span className="shPlayerDetails"><strong>{p.playerName||p.name}</strong><small>{label(p.sport)} · {p.market.replaceAll("_"," ")}</small><small>{p.pick.side} {p.pick.line} · {p.pick.sportsbook} {p.pick.price>0?'+':''}{p.pick.price}</small></span><span className="shPlayerGI"><small>MODEL</small>Pick</span></Link>)}{!featured.length?<p>{loaded?"No qualifying model picks in the available markets":"Checking current picks…"}</p>:null}</div></div></section></div>
  <footer className="shFooter">© SACH SPORTS · THE INTELLIGENCE EDGE</footer>
 </div></main>;
}
