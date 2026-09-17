"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { playerHeadshot } from "@/lib/mlb";

const MARKET_LABELS:Record<string,string>={home_runs:"Home Runs",hits:"Hits",total_bases:"Total Bases",runs:"Runs",rbis:"RBIs",walks:"Walks",stolen_bases:"Stolen Bases",hits_runs_rbis:"H+R+RBI",strikeouts:"Strikeouts",outs_recorded:"Outs",hits_allowed:"Hits Allowed",walks_allowed:"Walks Allowed",earned_runs:"Earned Runs"};
function inningsToOuts(value:any){const [whole,part="0"]=String(value||"0.0").split(".");return Number(whole||0)*3+Math.min(2,Number(part?.[0]||0)||0)}
function marketValue(stat:any,market:string,role:string){
  if(role==="pitcher"){
    if(market==="strikeouts")return Number(stat?.strikeOuts||0);
    if(market==="outs_recorded")return inningsToOuts(stat?.inningsPitched);
    if(market==="hits_allowed")return Number(stat?.hits||0);
    if(market==="walks_allowed")return Number(stat?.baseOnBalls||0);
    if(market==="earned_runs")return Number(stat?.earnedRuns||0);
  }
  if(market==="hits")return Number(stat?.hits||0);
  if(market==="total_bases")return Number(stat?.totalBases||0);
  if(market==="runs")return Number(stat?.runs||0);
  if(market==="rbis")return Number(stat?.rbi||0);
  if(market==="walks")return Number(stat?.baseOnBalls||0);
  if(market==="stolen_bases")return Number(stat?.stolenBases||0);
  if(market==="hits_runs_rbis")return Number(stat?.hits||0)+Number(stat?.runs||0)+Number(stat?.rbi||0);
  return Number(stat?.homeRuns||0);
}

export function MlbPlayer({playerId}:{playerId:string}){
  const [data,setData]=useState<any>(null); const [span,setSpan]=useState(10);
  const [context,setContext]=useState<Record<string,string>>({});
  useEffect(()=>{fetch(`/api/mlb/player/${playerId}`,{cache:"no-store"}).then(r=>r.json()).then(setData); const q=new URLSearchParams(window.location.search); setContext(Object.fromEntries(q.entries()));},[playerId]);
  const role=context.role||"batter", market=context.market||(role==="pitcher"?"strikeouts":"home_runs"), marketLabel=MARKET_LABELS[market]||"MLB Prop";
  const statsGroup=useMemo(()=>{const blocks=data?.stats||[];return blocks.filter((x:any)=>String(x?.group?.displayName||"").toLowerCase()===role).length?blocks.filter((x:any)=>String(x?.group?.displayName||"").toLowerCase()===role):blocks},[data,role]);
  const games=useMemo(()=>{const log=statsGroup.find((x:any)=>x.type?.displayName==="gameLog")?.splits||[]; return log.slice(-span)},[statsGroup,span]);
  if(!data)return <div className="legacyMlb subpage">Loading player intelligence…</div>;
  const p=data.person||{}; const season=statsGroup.find((x:any)=>x.type?.displayName==="season")?.splits?.[0]?.stat||{};
  const values=games.map((g:any)=>marketValue(g.stat,market,role)); const total=values.reduce((a:number,v:number)=>a+v,0);
  const avg=(n:number)=>{const slice=values.slice(-n);return slice.length?(slice.reduce((a:number,v:number)=>a+v,0)/slice.length).toFixed(1):"0.0"};
  return <div className="legacyMlb subpage">
    <div className="mlbSubTop"><Link className="mlbMenu" href="/" aria-label="Open menu">▦⌄</Link></div><div className="subnav"><Link href="/mlb">← Back to MLB</Link></div>
    <section className="playerHero"><img src={playerHeadshot(playerId)} alt=""/><div><h1>{p.fullName||"MLB Player"}</h1><p>{p.currentTeam?.name||context.team||"MLB"} · {p.primaryPosition?.abbreviation||""}{context.order?` · Batting #${context.order}`:""}</p>{context.matchup?<strong className="playerMatchup">vs. {context.matchup}{context.opp?` · ${context.opp}`:""}</strong>:null}</div></section>
    {context.gameTime?<section className="playerGameStatus"><small>GAME TIME</small><strong>{context.gameTime}</strong><span>{context.team}{context.opp?` vs. ${context.opp}`:""}</span></section>:null}
    <div className="playerContextBar"><strong>{marketLabel}</strong><span>#{context.rank||"—"} · GI {context.gi||"—"}{role==="pitcher"&&context.projection?` · ${context.projection}`:context.prob?` · ${context.prob}`:""}</span></div>
    <div className="playerKpis"><article><small>GI SCORE</small><strong>{context.gi||"—"}</strong></article><article><small>{role==="pitcher"?"PROJECTION":"PROBABILITY"}</small><strong>{role==="pitcher"?(context.projection||"—"):(context.prob||"—")}</strong></article><article><small>SEASON</small><strong>2026</strong></article></div>
    <section className="playerWhy"><h2>Why This Player Ranks Here</h2><p>The GI score combines verified recent MLB production, matchup context, sample reliability and today&apos;s game environment. Opened from the ranking card, this page keeps the saved rank and model context instead of recalculating the player after the game starts.</p></section>
    <div className="legacyTabs top playerSpan">{[5,10,20].map(n=><button key={n} className={span===n?"active":""} onClick={()=>setSpan(n)}>Last {n}</button>)}</div>
    <h2 className="chartTitle">Last {span} Games · {marketLabel}</h2><div className={`gameLogBars span${span}`}>{games.map((g:any,i:number)=>{const v=marketValue(g.stat,market,role); return <div key={i} className="barCol"><b>{v}</b><div className="bar" style={{height:`${Math.max(4,Math.min(160,v*18))}px`}}></div><span>{String(g.date||"").slice(5)}</span></div>})}</div>
    <div className="quickStats"><article><small>{span}-GAME TOTAL</small><strong>{total}</strong></article><article><small>L5 AVG</small><strong>{avg(5)}</strong></article><article><small>L10 AVG</small><strong>{avg(10)}</strong></article><article><small>GAMES</small><strong>{games.length}</strong></article></div>
    <div className="seasonGrid">{(role==="pitcher"?[["ERA",season.era],["Strikeouts",season.strikeOuts],["IP",season.inningsPitched],["Hits Allowed",season.hits],["Walks",season.baseOnBalls],["Earned Runs",season.earnedRuns]]:[["AVG",season.avg],["Hits",season.hits],["HR",season.homeRuns],["Total Bases",season.totalBases],["Runs",season.runs],["RBIs",season.rbi],["Walks",season.baseOnBalls],["Stolen Bases",season.stolenBases]]).map(([k,v]:any)=><article key={String(k)}><span>{k}</span><strong>{v??"—"}</strong></article>)}</div>
    {context.matchup&&role!=="pitcher"?<section className="intelText"><h3>⚔️ Head-to-Head vs. {context.matchup}</h3><p>No prior sample is treated as meaningful unless MLB returns usable matchup history. Today&apos;s evaluation should lean on current form, handedness, pitch profile and contact quality.</p></section>:null}
  </div>
}
