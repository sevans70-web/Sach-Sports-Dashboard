"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {IntelligenceHero,UpdatedStamp,GamesPreviewCard} from "./dashboard-chrome";
import {SnapshotPanel,snapshotGameDetail} from "./snapshot-panel";
import {PlayerRankingsPanel} from "./player-rankings-panel";
import {PredictionPerformancePanel} from "./prediction-performance-panel";
import {useDashboardSummary,useDashboardSchedule} from "./use-dashboard-summary";
import {SOCCER_LEAGUES} from "@/lib/soccer";
import {dashboardCounts,DEFAULT_MARKETS,type DashboardSport} from "@/lib/dashboard-contract";
export function SportsDashboard({sport}:{sport:DashboardSport}){
 const [league,setLeague]=useState("eng.1"),{data:summary,error}=useDashboardSummary(sport,league),schedule=useDashboardSchedule(sport,league);
 const data=summary||(schedule?{...dashboardCounts(schedule.games||[],[]),previewGames:schedule.games||[],weekNumber:schedule.weekNumber,market:DEFAULT_MARKETS[sport],updatedAt:schedule.updatedAt,scheduleAvailable:schedule.success!==false,rankingsAvailable:false}:null);
 const ready=data?.scheduleAvailable,ranked=data?.rankingsAvailable,market=String(data?.market||"").replaceAll("_"," ");
 useEffect(()=>{if(!["nba","wnba","nhl","cbb","soccer"].includes(sport))return;const controller=new AbortController();fetch(`/api/${sport}/capture${sport==="soccer"?`?league=${encodeURIComponent(league)}`:""}`,{method:"POST",cache:"no-store",signal:controller.signal}).catch(()=>{});return()=>controller.abort()},[sport,league]);
 const viewAll=`/${sport}/games${sport==="soccer"?`?league=${encodeURIComponent(league)}`:""}`;
 return <main className="ssDashboard" data-dashboard-sport={sport}>
  <IntelligenceHero sport={sport}/>
  {sport==="soccer"?<div className="soccerLeagueRow"><label htmlFor="soccer-league">Leagues</label><select id="soccer-league" value={league} onChange={e=>setLeague(e.target.value)}>{SOCCER_LEAGUES.map(([label,key])=><option value={key} key={key}>{label}</option>)}</select></div>:null}
  <UpdatedStamp value={data?.updatedAt} preview={false}/>
  <section className="ssGamesPreview" aria-label={`${sport.toUpperCase()} current slate`}>
   <div className="ssGamesPreviewHead"><h2>{sport==="nfl"?`${data?.weekNumber?`WEEK ${data.weekNumber}`:"CURRENT WEEK"} NFL GAMES`:`${sport.toUpperCase()} CURRENT + NEXT GAMES`}</h2><Link href={viewAll}>View All ›</Link></div>
   <div className="ssGamesPreviewGrid">{data?.previewGames?.length?data.previewGames.slice(0,3).map((g:any)=><GamesPreviewCard key={g.id} game={{...g,href:viewAll}}/>):<div className="ssGamesPreviewEmpty">{error||data?.scheduleAvailable===false?"Schedule temporarily unavailable":data?"No games in the current schedule window":"Loading the current slate…"}</div>}</div>
  </section>
  <SnapshotPanel title={`${sport.toUpperCase()} Snapshot`} note="" metrics={[
   {label:"Games",value:ready?data.games:"…",detail:ready?snapshotGameDetail(data.games,data.live,data.finals):"Loading current + next slate",icon:"games",tone:"green"},
   {label:"Lineups",value:ready?`${data.confirmedLineups}/${data.lineups}`:"…",detail:ready?`${data.confirmedLineups} confirmed · ${data.pendingLineups} awaiting confirmation`:"Team lineups",icon:"lineups"},
   {label:sport==='nba'?"Sach picks":"Predictions",value:ranked?(sport==='nba'?data.estimatedPicks||0:data.predictions):"…",detail:ranked?`${market} · ${sport==='nba'?'model estimates':'verified picks'}`:"Checking market data",icon:"predictions",tone:"gold"}
  ]}/>
  {error ? <p className="ssDashboardWarning" role="status">{error}</p> : null}
  <section className="performance"><PredictionPerformancePanel key={`${sport}|${league}`} sport={sport}/></section>
  <section className="rankings"><PlayerRankingsPanel key={`${sport}|${league}`} sport={sport}/></section>
 </main>;
}
