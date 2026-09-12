"use client";
import { useEffect, useMemo, useState } from "react";
import { SOCCER_LEAGUES, SOCCER_MARKETS, type SoccerDashboardResponse, type SoccerMarketKey, type SoccerRanking } from "@/lib/soccer";

const empty:SoccerDashboardResponse={success:false,league:"eng.1",leagueSlug:"eng.1",updatedAt:"",games:[],rankings:{shots_on_target:[],shots:[],saves:[],goals:[],assists:[]},playersTracked:0};
function fmtTime(v:string){if(!v)return"Time TBD";return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(new Date(v))+" ET"}
function initials(name:string){const p=name.trim().split(/\s+/);return (p.length>1?p[0][0]+p[p.length-1][0]:p[0]?.slice(0,2)||"SC").toUpperCase()}
function pct(v:number){return `${Math.round(Number(v||0))}%`}

function RankCard({row,market}:{row:SoccerRanking;market:SoccerMarketKey}){
 const[open,setOpen]=useState(false);const unit=market==="saves"?"saves":market==="shots_on_target"?"SOT":market;
 return <article className={`origRankCard soccerRankCard ${open?"expanded":""}`}>
  <div className="origRank">#{row.rank}<span>−</span></div>
  <div className="origPhotoWrap">{row.photoUrl?<img className="origHeadshot" src={row.photoUrl} alt=""/>:<div className="soccerAvatarFallback">{initials(row.playerName)}</div>}</div>
  <div className="origRankBody"><strong className="origName">{row.playerName}</strong><div className="origMatch">{row.team} · {row.matchup}</div><div className="origProp"><b>Projection:</b> {row.projection.toFixed(2)} {unit}</div><div className="origProp"><b>Probability:</b> {pct(row.modelProbability)} over {row.modelTarget}</div><p>{row.why}</p><div className="soccerStatus">{row.availability} · {Math.round(row.expectedMinutes)} expected min</div></div>
  <div className="origGi"><small>GI SCORE</small><strong>{row.giScore.toFixed(1)}</strong></div>
  <button className="origIntel soccerIntelButton" onClick={()=>setOpen(v=>!v)}>{open?"Close Intelligence":"View Intelligence"}</button>
  {open?<div className="origInlineIntel"><div className="intelKpis"><article><span>Recent Avg</span><strong>{row.avgMetric.toFixed(2)}</strong></article><article><span>Avg Minutes</span><strong>{Math.round(row.avgMinutes)}</strong></article><article><span>Start Rate</span><strong>{Math.round(row.startRate*100)}%</strong></article></div><details open><summary>Why this player?</summary><p>{row.why}. The ranking blends recent production, expected minutes, starter frequency, sample quality and the upcoming fixture. Sportsbook availability is not required for this ranking.</p></details></div>:null}
 </article>
}

export function SoccerDashboard(){
 const[league,setLeague]=useState("eng.1"),[data,setData]=useState(empty),[loading,setLoading]=useState(true),[market,setMarket]=useState<SoccerMarketKey>("shots_on_target"),[showFull,setShowFull]=useState(false),[period,setPeriod]=useState("Today"),[showGames,setShowGames]=useState(false);
 useEffect(()=>{let live=true;setLoading(true);fetch(`/api/soccer/dashboard?league=${encodeURIComponent(league)}`,{cache:"no-store"}).then(r=>r.json()).then(v=>live&&setData(v)).catch(()=>live&&setData(empty)).finally(()=>live&&setLoading(false));return()=>{live=false}},[league]);
 const leagueName=SOCCER_LEAGUES.find(x=>x[1]===league)?.[0]||"Soccer",upcoming=data.games.filter(g=>!g.completed),liveGames=data.games.filter(g=>g.state==="in"),finals=data.games.filter(g=>g.completed),rows=data.rankings?.[market]||[],active=SOCCER_MARKETS.find(x=>x[0]===market)!;
 const topSignal=rows[0];
 return <div className="origMlb soccerDashboard">
  <section className="soccerLeagueRow"><label>Competition</label><select value={league} onChange={e=>{setLeague(e.target.value);setShowFull(false)}}>{SOCCER_LEAGUES.map(([name,slug])=><option value={slug} key={slug}>{name}</option>)}</select></section>
  <section className="origHero soccerHero"><h1>Soccer Intelligence Center</h1><p>Start with the strongest players in each market, review the reason behind every ranking, and open the full Top 25 only when you need more depth.</p></section>
  <div className="origUpdated">Updated {data.updatedAt?fmtTime(data.updatedAt):"—"}</div>
  <button className="origGamesEntry soccerGamesEntry" onClick={()=>setShowGames(v=>!v)}><strong>⚽ TODAY&apos;S SOCCER GAMES</strong><span>› View today&apos;s slate &amp; matchup intelligence</span></button>
  {showGames?<section className="soccerSlate">{upcoming.slice(0,12).map(g=><article className={`soccerGameCard ${g.state==="in"?"live":""}`} key={g.gameId}><div><strong>{g.awayTeam} @ {g.homeTeam}</strong><span>{fmtTime(g.kickoff)}</span></div><b>{g.status}</b></article>)}</section>:null}

  <section className="origSnapshot"><div className="snapshotTitleRow"><h2>Today&apos;s Soccer Snapshot</h2><p>{leagueName}</p></div><div className="origMetrics snapshot"><article className="green"><span>Games</span><strong>{upcoming.length}</strong><small>{liveGames.length} live · {finals.length} final</small></article><article><span>Players</span><strong>{data.playersTracked}</strong><small>ranked from recent form</small></article><article className="gold"><span>Core Props</span><strong>5</strong><small>SOT · Shots · Saves · Goals · Assists</small></article></div></section>

  <section className="origSection soccerMatchup"><h2>🔥 Matchup Intelligence</h2>{upcoming.slice(0,3).map(g=><article className={`soccerGameCard ${g.state==="in"?"live":""}`} key={g.gameId}><div><strong>{g.awayTeam} @ {g.homeTeam}</strong><span>{fmtTime(g.kickoff)}</span></div><b>{g.status}</b></article>)}{!loading&&!upcoming.length?<div className="origInfo">No upcoming fixtures are currently available for {leagueName}.</div>:null}</section>

  <section className="origSection performance"><h2>📊 Prediction Performance</h2><details><summary>ⓘ How performance is measured</summary><div className="origExplain"><p>Soccer predictions will be graded from the ranked plays created by this Next.js engine. We will not backfill or fabricate historical results.</p></div></details><h3>🌐 Overall Soccer Performance</h3><div className="origPeriods">{["Today","Yesterday","Week","Month","Season"].map(x=><button key={x} className={period===x?"active":""} onClick={()=>setPeriod(x)}>{x}</button>)}</div><div className="origMetrics"><article className="green"><span>Hit Rate</span><strong>—</strong></article><article><span>Correct / Settled</span><strong>0 / 0</strong></article><article className="gold"><span>Pending</span><strong>0</strong></article></div><div className="soccerPerfNote">Performance begins collecting after Soccer rankings are deployed and games settle.</div></section>

  <section className="origSection rankings"><div className="origRankingsHeader"><h2>Player Rankings</h2><p>Market-specific intelligence · upcoming matchup context</p></div>
   {!loading&&!data.success?<div className="origDataNote"><b>Soccer data temporarily unavailable.</b> Rankings will return automatically when the source reconnects.</div>:null}
   <div className="origTabs markets soccerMarkets">{SOCCER_MARKETS.map(([key,icon,label])=><button key={key} className={market===key?"active":""} onClick={()=>{setMarket(key);setShowFull(false)}}>{icon} {label}</button>)}</div>
   <div className="origMarketHead"><h2>{active[1]} {active[2]} Rankings</h2><p>Ranked by Soccer GI Score using recent production, expected minutes, starting reliability, sample quality and the upcoming fixture. Sportsbook lines are optional enrichment — they are not required for the Top 25.</p></div>
   {topSignal?<div className="soccerBest"><small>BEST CURRENT {active[2].toUpperCase()} SIGNAL</small><strong>#{topSignal.rank} {topSignal.playerName}</strong><span>GI {topSignal.giScore.toFixed(1)} · {pct(topSignal.modelProbability)} model probability · {topSignal.matchup}</span></div>:null}
   <div className="origCards">{rows.slice(0,showFull?25:5).map(r=><RankCard key={`${market}-${r.playerId}-${r.rank}`} row={r} market={market}/>)}{!loading&&!rows.length?<div className="origEmpty">No eligible {active[2]} rankings are available yet for this slate.</div>:null}{loading?<div className="origInfo">Loading {leagueName} player intelligence…</div>:null}</div>
   {rows.length>5?<button className="viewFullTop25" onClick={()=>setShowFull(v=>!v)}>{showFull?"Show Top 5 Only":"View Full Top 25"}</button>:null}
  </section>
 </div>
}
