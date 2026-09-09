"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BATTER_MARKETS, PITCHER_MARKETS, playerHeadshot, rankingName, rankingPlayerId, numberValue, percentValue, type RankingRow } from "@/lib/mlb";

type ScheduleResponse = { success:boolean; games:any[]; fetchedAt?:string; lineupsConfirmed?:number; error?:string };
type RankingResponse = { success:boolean; batter:Record<string,RankingRow[]>; pitcher:Record<string,RankingRow[]>; connected:boolean; errors?:string[]; updatedAt?:string; dataDate?:string };
type PerformanceResponse = { success:boolean; connected:boolean; batter:any; pitcher:any; emerging:any; errors?:string[] };

function useJson<T>(url:string,fallback:T){const[data,setData]=useState<T>(fallback);const[loading,setLoading]=useState(true);useEffect(()=>{let live=true;const load=()=>fetch(url,{cache:"no-store"}).then(r=>r.json()).then(v=>live&&setData(v)).catch(()=>{}).finally(()=>live&&setLoading(false));load();const id=setInterval(load,30000);return()=>{live=false;clearInterval(id)}},[url]);return{data,loading}}
function historyRows(payload:any){return Object.entries(payload?.days||{}).sort(([a],[b])=>String(b).localeCompare(String(a)))}
function aggregate(payload:any,period:string){const rows=historyRows(payload);const now=new Date();let settled=0,correct=0,pending=0;for(const[date,day]of rows as any[]){const diff=Math.floor((+now-+new Date(`${date}T12:00:00`))/86400000);const include=period==="Today"?diff===0:period==="Yesterday"?diff===1:period==="Week"?diff>=0&&diff<7:period==="Month"?diff>=0&&diff<31:true;if(!include)continue;for(const cat of Object.values(day?.categories||{}) as any[])for(const row of(Array.isArray(cat)?cat:[])){const boolCorrect=typeof row?.correct==="boolean"?row.correct:null;const finalized=row?.finalized===true;const label=String(row?.result_label||row?.status||row?.result||"").toLowerCase();const isSettled=boolCorrect!==null||finalized||/hit|miss|win|loss|won|lost|correct|incorrect/.test(label);if(!isSettled){pending++;continue}settled++;if(boolCorrect===true||/hit|win|won|correct/.test(label))correct++;}}return{settled,correct,pending,hitRate:settled?(correct/settled*100).toFixed(1):"0.0"}}

function RankingCard({row,pitcher=false}:{row:RankingRow;pitcher?:boolean}){
  const id=rankingPlayerId(row),name=rankingName(row),image=String(row.headshot_url||playerHeadshot(id));
  const gi=numberValue(row.gi_score,1), team=String(row.team_abbreviation||row.team_name||"MLB"),opp=String(row.opponent_abbreviation||row.opponent_name||"");
  const probability=percentValue(row.hr_probability??row.probability),projection=numberValue(row.projection,1),pitcherName=String(row.opposing_probable_pitcher||row.probable_pitcher||"");
  const confirmed=row.lineup_confirmed!==false;
  return <article className={`origRankCard ${pitcher?"pitcher":"batter"}`}>
    <div className="origRank">#{Number(row.rank||0)||"—"}<span>−</span></div>
    <img className="origHeadshot" src={image} alt=""/>
    <div className="origRankBody"><strong className="origName">{name}</strong><div className="origMatch">{team}{opp?` vs. ${opp}`:""}</div>
      {pitcher?<><div className="origProp"><b>Projection:</b> {projection} K</div></>:<><div className="origProp">{pitcherName?<>vs. <b>{pitcherName}</b></>:null}</div><div className="origProp"><b>HR Probability:</b> {probability}</div></>}
      <p>{String((row as any).summary||(row as any).reason||(row as any).intelligence_summary||(pitcher?"Ranked by workload, season rates, matchup and sample reliability.":"GI score blends performance, matchup, lineup position, park/weather and sample reliability."))}</p>
      <span className="confirmed">✓ {confirmed?"Confirmed lineup":"Lineup Pending"}{row.batting_order?` · #${row.batting_order}`:""}</span>
    </div>
    <div className="origGi"><small>GI SCORE</small><strong>{gi}</strong></div>
    {id?<Link className="origIntel" href={`/mlb/player/${id}`}>ⓘ View Intelligence</Link>:<button className="origIntel" disabled>ⓘ View Intelligence</button>}
  </article>
}

export function MlbDashboard(){
  const schedule=useJson<ScheduleResponse>("/api/mlb/schedule",{success:false,games:[]});
  const rankings=useJson<RankingResponse>("/api/mlb/rankings",{success:false,batter:{},pitcher:{},connected:false});
  const performance=useJson<PerformanceResponse>("/api/mlb/performance",{success:false,connected:false,batter:{},pitcher:{},emerging:{}});
  const[role,setRole]=useState<"Batter"|"Pitcher">("Batter"),[market,setMarket]=useState("home_runs"),[period,setPeriod]=useState("Today"),[perfRole,setPerfRole]=useState<"Batter"|"Pitcher"|"Emerging Power">("Batter"),[hrTab,setHrTab]=useState<"Live HR"|"Yesterday"|"Emerging Power">("Live HR");
  const games=schedule.data.games||[],liveGames=games.filter(g=>g.isLive),delayed=games.filter(g=>g.isDelayed).length;
  const perfPayload=perfRole==="Pitcher"?performance.data.pitcher:perfRole==="Emerging Power"?performance.data.emerging:performance.data.batter;
  const perf=useMemo(()=>aggregate(perfPayload,period),[perfPayload,period]);
  const marketList=role==="Batter"?BATTER_MARKETS:PITCHER_MARKETS;
  useEffect(()=>{if(role==="Batter"&&!BATTER_MARKETS.some(x=>x[0]===market))setMarket("home_runs");if(role==="Pitcher"&&!PITCHER_MARKETS.some(x=>x[0]===market))setMarket("strikeouts")},[role,market]);
  const rows=(role==="Batter"?rankings.data.batter?.[market]:rankings.data.pitcher?.[market])||[],activeMarket=marketList.find(x=>x[0]===market)||marketList[0];
  const updated=rankings.data.updatedAt?new Date(rankings.data.updatedAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"}):"Live";

  return <div className="origMlb">
    <section className="origHero"><h1>MLB Intelligence Center</h1><p>Start with the strongest players in each market, review the reason behind every ranking, and open the full Top 25 only when you need more depth.</p></section>
    <div className="origUpdated">Updated {updated}</div>

    <Link className="origGamesEntry" href="/mlb/games"><strong>⚾ TODAY&apos;S MLB GAMES</strong><span>Open today&apos;s slate, lineups &amp; Game Intelligence ›</span></Link>
    <section className="origSnapshot"><h2>Today&apos;s MLB Snapshot</h2><p>Always confirm starting lineups</p><div className="origMetrics snapshot"><article className="green"><span>GAMES</span><strong>{schedule.loading?"…":games.length}</strong><small>Official MLB schedule</small></article><article><span>LINEUPS</span><strong>{schedule.data.lineupsConfirmed??"—"}</strong><small>Confirmed teams</small></article><article className="gold"><span>ALERTS</span><strong>{delayed}</strong><small>Delayed / suspended</small></article></div></section>

    <section className="origSection hr"><h2>🔥 HR Intelligence</h2><div className="origTabs three">{(["Live HR","Yesterday","Emerging Power"] as const).map(x=><button key={x} className={hrTab===x?"active":""} onClick={()=>setHrTab(x)}>{x}</button>)}</div>
      {hrTab==="Live HR"&&<><details open><summary>ⓘ What do the HR contact signals mean?</summary><div className="origExplain"><p><b>🔥 Barrel</b> — a batted ball with a strong combination of exit velocity and launch angle associated with extra-base damage and home-run potential.</p><p><b>💥 Hard Hit</b> — a batted ball hit at <b>95 mph or harder</b> that does not necessarily qualify as a barrel.</p><p><b>mph / Exit Velocity</b> — how fast the ball leaves the bat. Higher is generally stronger contact.</p><p><b>° / Launch Angle</b> — the vertical angle at which the ball leaves the bat. The angle helps distinguish a ground ball, line drive, or fly ball.</p><p><b>Important:</b> a barrel or hard hit is a contact-quality signal, <b>not a prediction or guarantee</b> that the player will hit a home run.</p></div></details><details><summary>ⓘ What should I look for in an HR pick?</summary><div className="origExplain"><p><b>Start with barrel rate:</b> below 7% is low, 7–9.9% is average, 10–14.9% is strong, and 15%+ is elite HR contact.</p><p><b>Then confirm the full picture:</b> strong xSLG and recent barrels, a vulnerable opposing pitcher, favourable handedness, a hitter-friendly park or weather edge, and a confirmed top-five lineup position.</p></div></details><div className="origLiveNotice">{liveGames.length?`${liveGames.length} MLB game${liveGames.length===1?" is":"s are"} currently live.`:delayed?`${delayed} MLB game${delayed===1?" is":"s are"} delayed. Delayed games are not treated as live.`:"No MLB games are currently live."}</div></>}
      {hrTab==="Yesterday"&&<div className="origInfo">Yesterday&apos;s HR results come from the performance history feed.</div>}
      {hrTab==="Emerging Power"&&<div className="origInfo">Emerging Power uses the saved worker snapshot when available and stays separate from the normal Top 25 rankings.</div>}
    </section>

    <section className="origSection performance"><h2>📊 Prediction Performance</h2><details><summary>ⓘ How performance is measured</summary><div className="origExplain"><p>Settled predictions are graded against the recorded MLB result. Pending predictions are excluded from hit rate until they settle.</p></div></details>
      <div className="origTabs three">{(["Batter","Pitcher","Emerging Power"] as const).map(x=><button key={x} className={perfRole===x?"active":""} onClick={()=>setPerfRole(x)}>{x==="Batter"?"🥎 ":x==="Pitcher"?"⚾ ":"🔥 "}{x}</button>)}</div>
      <h3>🌐 Overall MLB {perfRole} Performance</h3><div className="origPeriods">{["Today","Yesterday","Week","Month","Season"].map(x=><button key={x} className={period===x?"active":""} onClick={()=>setPeriod(x)}>{x}</button>)}</div>
      <div className="origMetrics"><article className="green"><span>Hit Rate</span><strong>{perf.hitRate}%</strong></article><article><span>Correct / Settled</span><strong>{perf.correct} / {perf.settled}</strong></article><article className="gold"><span>Pending</span><strong>{perf.pending}</strong></article></div>
    </section>

    <section className="origSection rankings"><div className="origRankingsHeader"><h2>Player Rankings</h2><p>Market-specific intelligence · live matchup context</p></div>
      {!rankings.loading&&!rankings.data.connected?<div className="origDataNote"><b>Data connection required:</b> add the existing Supabase variables to this Railway service. The page will populate automatically after redeploy.</div>:null}
      <div className="origTabs two"><button className={role==="Batter"?"active":""} onClick={()=>setRole("Batter")}>🥎 Batter</button><button className={role==="Pitcher"?"active":""} onClick={()=>setRole("Pitcher")}>⚾ Pitcher</button></div>
      <div className="origTabs markets">{marketList.map(([key,icon,label])=><button key={key} className={market===key?"active":""} onClick={()=>setMarket(key)}>{icon} {label}</button>)}</div>
      <div className="origMarketHead"><h2>{activeMarket[1]} {activeMarket[2]}{role==="Batter"?" Rankings":""}</h2><p>{role==="Batter"?"Ranked by GI Score. Probability is one component of the score, alongside player performance, matchup, lineup position, ballpark, weather, and sample reliability.":"Ranked by pitcher GI score using workload, season rates, sample reliability, matchup and opponent handedness."}</p></div>
      <div className="origCards">{rows.slice(0,5).map((row,i)=><RankingCard key={`${rankingPlayerId(row)}-${i}`} row={row} pitcher={role==="Pitcher"}/>)}{!rankings.loading&&rows.length===0?<div className="origEmpty">No completed {activeMarket[2]} snapshot is available yet.</div>:null}</div>
    </section>
  </div>
}
