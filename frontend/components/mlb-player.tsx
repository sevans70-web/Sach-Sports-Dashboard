"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { playerHeadshot } from "@/lib/mlb";

export function MlbPlayer({playerId}:{playerId:string}){
  const [data,setData]=useState<any>(null); const [span,setSpan]=useState(10);
  const [context,setContext]=useState<Record<string,string>>({});
  useEffect(()=>{fetch(`/api/mlb/player/${playerId}`,{cache:"no-store"}).then(r=>r.json()).then(setData); const q=new URLSearchParams(window.location.search); setContext(Object.fromEntries(q.entries()));},[playerId]);
  const games=useMemo(()=>{const blocks=data?.stats||[]; const log=blocks.find((x:any)=>x.type?.displayName==="gameLog")?.splits||[]; return log.slice(-span)},[data,span]);
  if(!data)return <div className="legacyMlb subpage">Loading player intelligence…</div>;
  const p=data.person||{}; const season=(data.stats||[]).find((x:any)=>x.type?.displayName==="season")?.splits?.[0]?.stat||{};
  const recent=games.reduce((a:number,g:any)=>a+Number(g.stat?.homeRuns||0),0);
  return <div className="legacyMlb subpage">
    <div className="mlbSubTop"><Link className="mlbMenu" href="/" aria-label="Open menu">▦⌄</Link></div><div className="subnav"><Link href="/mlb">← Back to MLB</Link></div>
    <section className="playerHero"><img src={playerHeadshot(playerId)} alt=""/><div><h1>{p.fullName||"MLB Player"}</h1><p>{p.currentTeam?.name||context.team||"MLB"} · {p.primaryPosition?.abbreviation||""}{context.order?` · Batting #${context.order}`:""}</p>{context.matchup?<strong className="playerMatchup">vs. {context.matchup}{context.opp?` · ${context.opp}`:""}</strong>:null}</div></section>
    {context.gi?<div className="playerContextBar"><strong>Home Runs</strong><span>#{context.rank||"—"} · GI {context.gi}{context.prob?` · ${context.prob}`:""}</span></div>:null}
    <div className="legacyTabs top playerSpan">{[5,10,20].map(n=><button key={n} className={span===n?"active":""} onClick={()=>setSpan(n)}>Last {n}</button>)}</div>
    <h2 className="chartTitle">Last {span} Games · HR</h2><div className={`gameLogBars span${span}`}>{games.map((g:any,i:number)=>{const v=Number(g.stat?.homeRuns||0); return <div key={i} className="barCol"><b>{v}</b><div className="bar" style={{height:`${Math.max(4,v*58)}px`}}></div><span>{String(g.date||"").slice(5)}</span></div>})}</div>
    <div className="quickStats"><article><small>{span}-GAME TOTAL</small><strong>{recent}</strong></article><article><small>L5 AVG</small><strong>{games.slice(-5).length?(games.slice(-5).reduce((a:number,g:any)=>a+Number(g.stat?.homeRuns||0),0)/games.slice(-5).length).toFixed(1):"0.0"}</strong></article><article><small>L10 AVG</small><strong>{games.slice(-10).length?(games.slice(-10).reduce((a:number,g:any)=>a+Number(g.stat?.homeRuns||0),0)/games.slice(-10).length).toFixed(1):"0.0"}</strong></article><article><small>L10 HIT</small><strong>{games.slice(-10).filter((g:any)=>Number(g.stat?.homeRuns||0)>0).length}/{Math.min(10,games.length)}</strong></article></div>
    <div className="seasonGrid">{[["AVG",season.avg],["Hits",season.hits],["HR",season.homeRuns],["Total Bases",season.totalBases],["Runs",season.runs],["RBIs",season.rbi],["Walks",season.baseOnBalls],["Stolen Bases",season.stolenBases]].map(([k,v])=><article key={String(k)}><span>{k}</span><strong>{v??"—"}</strong></article>)}</div>
    {context.matchup?<section className="intelText"><h3>⚔️ Head-to-Head vs. {context.matchup}</h3><p>No prior sample is treated as meaningful unless MLB returns usable matchup history. Today&apos;s evaluation should lean on current form, handedness, pitch profile and contact quality.</p></section>:null}
    <section className="intelText"><h3>🧠 Today&apos;s Intelligence</h3><p><b>Recent form:</b> Over the selected {span} games, {p.fullName||"this player"} has {recent} home run{recent===1?"":"s"}. The chart and season cards are connected to MLB&apos;s official player statistics feed.</p><p><b>GI context:</b> {context.gi?`The player is currently #${context.rank||"—"} with a GI score of ${context.gi}${context.prob?` and ${context.prob} probability`:""}.`:"Open this player from rankings to carry the saved model score and matchup context into this card."}</p>{context.matchup?<p><b>Pitcher matchup:</b> Today&apos;s opposing pitcher is {context.matchup}. The model combines that matchup with recent form, lineup opportunity and contact quality.</p>:null}{context.order?<p><b>Opportunity:</b> Batting #{context.order} shapes expected plate appearances and opportunity.</p>:null}</section>
  </div>
}
