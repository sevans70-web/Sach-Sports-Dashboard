"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {CFB_MARKETS,type CfbMarketKey,type CfbRankingRow} from "@/lib/cfb";

type CfbPerformanceResponse={success:boolean;connected:boolean;hits:number;settled:number;pending:number;hitRate:number|null;total?:number;predictions?:any[]};

type ScheduleResponse={success:boolean;games:any[];qualifiedCount:number;filterMode?:string;updatedAt?:string};
type RankingResponse={success:boolean;rows:CfbRankingRow[];updatedAt?:string};

const QB_MARKETS:CfbMarketKey[]=["passing_yards","pass_completions"];
const OFFENSE_MARKETS:CfbMarketKey[]=["rushing_yards","receiving_yards","receptions","anytime_td","first_td"];

function useJson<T>(url:string,fallback:T){
  const[data,setData]=useState(fallback);
  const[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    const run=()=>fetch(url,{cache:"no-store"})
      .then(r=>r.json())
      .then(v=>active&&setData(v))
      .catch(()=>{})
      .finally(()=>active&&setLoading(false));
    run();
    const id=setInterval(run,30000);
    return()=>{active=false;clearInterval(id)}
  },[url]);
  return{data,loading};
}

function marketMeta(key:CfbMarketKey){return CFB_MARKETS.find(x=>x[0]===key)!}

function projectionText(row:CfbRankingRow,market:CfbMarketKey){
  if(market==="first_td"){
    return row.modelProbability!=null?`${Number(row.modelProbability).toFixed(0)}% chance`:"Model unavailable";
  }
  const v=row.modelProjection;
  if(v==null||!Number.isFinite(Number(v)))return "Insufficient history";
  const n=Number(v);
  if(market==="passing_yards"||market==="rushing_yards"||market==="receiving_yards")return `${n.toFixed(1)} yds`;
  if(market==="pass_completions")return `${n.toFixed(1)} comp`;
  if(market==="receptions")return `${n.toFixed(1)} rec`;
  if(market==="anytime_td")return `${n.toFixed(1)} TD`;
  return n.toFixed(1);
}

function MenuButton(){
  return <Link href="/" className="cfbMenu" aria-label="Open sports menu">▦⌄</Link>;
}

function fallbackSummary(label:string){
  return `${label} ranking is based on verified college production and current matchup context. Sportsbook player-prop lines are still pending.`;
}

function RankingCard({row,market}:{row:CfbRankingRow;market:CfbMarketKey}){
  const[open,setOpen]=useState(false);
  const meta=marketMeta(market);
  const projection=projectionText(row,market);

  return <article className="rankCard">
    <div className="rankNo">#{row.rank}<span>−</span></div>
    <div className="rankPhoto">{row.headshot?<img src={row.headshot} alt=""/>:<div>CFB</div>}</div>
    <div className="rankBody">
      <strong>{row.playerName}</strong>
      <span>{row.teamName}{row.matchup?` · ${row.matchup}`:""}</span>
      <b>{row.sportsbookLine!=null?`${meta[2]} line: ${row.sportsbookLine}`:`${meta[2]} statistical intelligence`}</b>
      <p className="projectionLine"><b>Model projection:</b> {projection}</p>
      <p>{row.marketBacked?(row.modelProbability!=null?`Model probability: ${Number(row.modelProbability).toFixed(0)}%`:"Model probability: Insufficient history"):"Verified season production · sportsbook line pending"}</p>
      {row.resultStatus&&row.resultStatus!=="pending"?<p className={`finalResult ${row.resultStatus}`}><b>{row.resultSymbol||""} FINAL:</b> {row.actualResult!=null?`${row.actualResult} actual`:(row.resultStatus==="void"?"Void":"")}</p>:null}
    </div>
    <div className="rankGi"><span>GI SCORE</span><strong>{Number(row.giScore||0).toFixed(1)}</strong></div>

    <button className="intelButton" onClick={()=>setOpen(v=>!v)}>{open?"ⓘ Hide Intelligence":"ⓘ View Intelligence"}</button>

    {open?<div className="detail">
      <div className="detailMetric green"><span>MODEL</span><b>{row.marketBacked?(row.modelProbability!=null?`${Number(row.modelProbability).toFixed(1)}%`:"—"):"Stat Model"}</b></div>
      <div className="detailMetric"><span>SPORTSBOOK LINE</span><b>{row.sportsbookLine??"—"}</b></div>
      <div className="detailMetric gold"><span>BOOKS</span><b>{row.bookmakerCount||0}</b></div>
      <div className="detailMetric"><span>DATA</span><b>{row.marketBacked?"Market + Stats":"Verified"}</b></div>

      <div className="projectionBox">
        <span>MODEL PROJECTION</span>
        <strong>{projection}</strong>
        {row.projectionGames?<small>Recent sample: {row.projectionGames} game{row.projectionGames===1?"":"s"}</small>:null}
      </div>

      <div className="why"><b>Why This Player Ranks Here</b><p>{row.marketBacked?row.summary:fallbackSummary(meta[2])}</p></div>
      <Link className="fullCard" href={`/cfb/player/${encodeURIComponent(row.playerId)}?market=${encodeURIComponent(market)}&name=${encodeURIComponent(row.playerName)}&team=${encodeURIComponent(row.teamName)}&matchup=${encodeURIComponent(row.matchup)}&gi=${row.giScore}&prob=${row.modelProbability??""}&line=${row.sportsbookLine??""}&projection=${encodeURIComponent(String(row.modelProjection??""))}&img=${encodeURIComponent(row.headshot||"")}&position=${encodeURIComponent(row.position||"")}&teamId=${encodeURIComponent(row.teamId||"")}`}>Open full player card</Link>
    </div>:null}
  </article>;
}

export default function CfbDashboard(){
  const[group,setGroup]=useState<"QB"|"Offense">("QB");
  const[market,setMarket]=useState<CfbMarketKey>("passing_yards");
  const[full,setFull]=useState(false);
  const[period,setPeriod]=useState("Today");
  const s=useJson<ScheduleResponse>("/api/cfb/schedule",{success:false,games:[],qualifiedCount:0});
  const r=useJson<RankingResponse>(`/api/cfb/rankings?market=${market}`,{success:false,rows:[]});
  const overallPerf=useJson<CfbPerformanceResponse>(`/api/cfb/performance?period=${period}&group=${group}`,{success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null});
  const marketPerf=useJson<CfbPerformanceResponse>(`/api/cfb/performance?period=${period}&group=${group}&market=${market}`,{success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null});

  const rows=useMemo(()=>r.data.rows||[],[r.data]);
  const active=marketMeta(market);
  const live=s.data.games.filter((g:any)=>g.state==="in").length;
  const finals=s.data.games.filter((g:any)=>g.completed).length;
  const gameCount=s.data.filterMode==="schedule_fallback"?s.data.games.length:s.data.qualifiedCount;
  const markets=group==="QB"?QB_MARKETS:OFFENSE_MARKETS;

  useEffect(()=>{if(!markets.includes(market))setMarket(markets[0]);setFull(false)},[group]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(()=>setFull(false),[market]);

  return <main className="cfbShell">
    <MenuButton/>

    <section className="hero">
      <h1>CFB Intelligence Center</h1>
      <p>Start with the strongest players in each supported college market, review the reason behind every ranking, and open the full rankings only when you need more depth.</p>
    </section>

    <div className="updated">Last updated Live</div>

    <Link className="gamesEntry" href="/cfb/games">
      <b>🏈 THIS WEEK&apos;S CFB GAMES</b>
      <span>Open the slate, team rosters &amp; Game Intelligence ›</span>
    </Link>

    <h2 className="snapshotTitle">This Week&apos;s CFB Snapshot</h2>
    <p className="greenNote">{s.data.filterMode==="schedule_fallback"?"Player-prop availability pending — current weekly slate shown.":"Only games with at least one supported player prop are counted."}</p>
    <div className="snapshot">
      <article className="green"><span>GAMES</span><strong>{gameCount}</strong><small>{live} live · {finals} final</small></article>
      <article><span>MARKETS</span><strong>7</strong><small>College-supported categories</small></article>
      <article className="gold"><span>ALERTS</span><strong>0</strong><small>No active alerts</small></article>
    </div>

    <section className="section performance">
      <h2 className="performanceTitle">📊 Prediction Performance</h2>
      <details><summary>ⓘ How performance is measured</summary><div className="explain">Settled predictions are graded against recorded results. Pending predictions are excluded from hit rate until they settle.</div></details>

      <div className="lineTabs groupTabs">
        <button className={group==="QB"?"active":""} onClick={()=>setGroup("QB")}>🏈 QB</button>
        <button className={group==="Offense"?"active":""} onClick={()=>setGroup("Offense")}>🏃 Offense</button>
      </div>

      <h3>🌐 Overall CFB {group} Performance</h3>
      <div className="periodTabs">
        {["Today","Yesterday","Week","Month","Season"].map(x=><button className={period===x?"active":""} onClick={()=>setPeriod(x)} key={x}>{x}</button>)}
      </div>

      <div className="overallMetrics">
        <article className="green"><span>Hit Rate</span><strong>{overallPerf.data.hitRate==null?"—":`${overallPerf.data.hitRate}%`}</strong></article>
        <article><span>Correct / Settled</span><strong>{overallPerf.data.hits} / {overallPerf.data.settled}</strong></article>
        <article className="gold"><span>Pending</span><strong>{overallPerf.data.pending}</strong></article>
      </div>

      <div className="lineTabs marketTabs">
        {markets.map(k=>{const m=marketMeta(k);return <button className={market===k?"active":""} onClick={()=>setMarket(k)} key={k}>{m[1]} {m[2]}</button>})}
      </div>

      <div className="perfGrid">
        <article className="green"><span>Hits / Predictions</span><strong>{marketPerf.data.hits} / {marketPerf.data.total||0}</strong></article>
        <article><span>Pending</span><strong>{marketPerf.data.pending}</strong></article>
        <article className="gold"><span>Settled</span><strong>{marketPerf.data.settled}</strong></article>
        <article><span>Hit Rate</span><strong>{marketPerf.data.hitRate==null?"—":`${marketPerf.data.hitRate}%`}</strong></article>
      </div>
      <small>Results will appear after saved predictions are graded.</small>
    </section>

    <section className="section rankings">
      <div className="rankHeader"><h2>Player Rankings</h2><p>Market-specific intelligence · live matchup context</p></div>

      <div className="lineTabs groupTabs">
        <button className={group==="QB"?"active":""} onClick={()=>setGroup("QB")}>🏈 QB</button>
        <button className={group==="Offense"?"active":""} onClick={()=>setGroup("Offense")}>🏃 Offense</button>
      </div>

      <div className="lineTabs marketTabs">
        {markets.map(k=>{const m=marketMeta(k);return <button className={market===k?"active":""} onClick={()=>setMarket(k)} key={k}>{m[1]} {m[2]}</button>})}
      </div>

      <div className="marketHead">
        <h2>{active[1]} {active[2]} Rankings</h2>
        <p>Ranked by GI Score. College market depth varies by game and sportsbook, so the list expands only as far as legitimate coverage allows.</p>
      </div>

      <div className="cards">{(full?rows:rows.slice(0,5)).map(row=><RankingCard row={row} market={market} key={`${row.playerId}-${row.rank}`}/>)}</div>
      {!r.loading&&rows.length===0?<div className="empty">Ranking data is still loading from the CFB market and verified statistical feeds.</div>:null}
      {rows.length>5?<button className="viewFull" onClick={()=>setFull(v=>!v)}>{full?"Show Top 5 Only":"View Full Rankings"}</button>:null}
    </section>

    <style jsx global>{`
      .finalResult{margin-top:8px!important;font-weight:800}.finalResult.hit{color:#45ef8d}.finalResult.miss{color:#ff6b6b}.finalResult.push{color:#d9b85d}
      .cfbShell{max-width:780px;margin:0 auto;padding:10px 14px 80px;color:#fff}
      .cfbMenu{display:grid;place-items:center;width:58px;height:58px;margin:0 0 24px;border:2px solid #20df7f;border-radius:16px;background:#0c0e0d;color:#fff!important;text-decoration:none!important;font-size:22px}
      .cfbShell .hero{border:2px solid #d9b85d;border-radius:18px;padding:18px 20px;background:linear-gradient(110deg,rgba(217,184,93,.48),#0b0d0e 48%,rgba(0,78,47,.78))}
      .cfbShell .hero h1{font-size:34px;margin:0 0 10px;font-weight:900}
      .cfbShell .hero p{margin:0;color:#c8c8ce;line-height:1.45;font-size:18px}
      .cfbShell .updated{text-align:right;color:#9498a0;margin:8px 0 16px}
      .cfbShell .gamesEntry{display:flex;flex-direction:column;gap:5px;border:2px solid #d9b85d;border-left:10px solid #20df7f;border-radius:18px;padding:18px 20px;color:#fff!important;text-decoration:none!important;background:linear-gradient(100deg,rgba(32,223,127,.10),#0d0f10 42%,rgba(217,184,93,.06))}
      .cfbShell .gamesEntry b{font-size:23px}.cfbShell .gamesEntry span{font-size:18px}
      .snapshotTitle{font-size:30px;margin:26px 0 4px}.greenNote{color:#20df7f;margin:0 0 12px;font-weight:700}
      .snapshot{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .snapshot article,.overallMetrics article,.perfGrid article{border:2px solid #34373d;border-radius:18px;padding:14px;background:#111214;display:flex;flex-direction:column;gap:8px}
      .snapshot .green,.overallMetrics .green,.perfGrid .green{border-color:#20df7f}.snapshot .gold,.overallMetrics .gold,.perfGrid .gold{border-color:#d9b85d}
      .snapshot span,.overallMetrics span,.perfGrid span{color:#9da1a8;font-size:13px}.snapshot strong,.overallMetrics strong,.perfGrid strong{font-size:26px}.snapshot small{color:#d0d1d4}
      .section{margin-top:34px}.performanceTitle{font-size:31px!important;white-space:nowrap!important;line-height:1!important;letter-spacing:-.02em}
      .section>h2,.rankHeader h2{font-size:31px;margin:0 0 8px}.rankHeader p,.marketHead p{color:#a9acb3;line-height:1.4}
      .section details{border:2px solid #34373d;border-radius:16px;padding:13px 16px;margin:14px 0}.section summary{font-size:17px}.explain{color:#a9acb3;margin-top:10px}
      .lineTabs{display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:2px solid #34373d}.lineTabs::-webkit-scrollbar{display:none}
      .lineTabs button{flex:0 0 auto;white-space:nowrap;background:transparent;border:0;border-bottom:4px solid transparent;color:#fff;padding:13px 18px 10px;font-size:17px;font-weight:800}
      .lineTabs button.active{border-bottom-color:#f04f5f;color:#fff;background:transparent}
      .periodTabs{display:grid;grid-template-columns:repeat(5,minmax(92px,1fr));overflow-x:auto;scrollbar-width:none}
      .periodTabs::-webkit-scrollbar{display:none}.periodTabs button{white-space:nowrap;background:#111319;border:1px solid #383b42;color:#fff;padding:13px 14px;font-size:16px;font-weight:700}
      .periodTabs button.active{background:#351015;border-color:#f04f5f;color:#fff}
      .performance h3{font-size:24px;margin:18px 0 8px}
      .overallMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:12px 0 22px}.perfGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:12px 0}
      .rankHeader{background:#0c0d0e;padding:20px;margin-top:8px}.rankHeader h2{font-size:34px}.rankHeader p{margin-bottom:0;font-size:18px}
      .marketHead h2{font-size:30px;margin:24px 0 8px}.marketHead p{font-size:18px}
      .rankCard{position:relative;display:grid;grid-template-columns:55px 120px 1fr 86px;gap:12px;border:4px solid #34373d;border-left:16px solid #20df7f;border-radius:26px;background:#111214;padding:20px;margin:20px 0;overflow:hidden}
      .rankNo{font-size:26px;font-weight:900}.rankNo span{display:block;color:#9da1a8;margin-top:12px}
      .rankPhoto img,.rankPhoto>div{width:112px;height:112px;border-radius:50%;border:4px solid #d9b85d;object-fit:cover}.rankPhoto>div{display:grid;place-items:center;color:#d9b85d;font-weight:900}
      .rankBody strong{display:block;font-size:25px}.rankBody span{display:block;color:#a9acb3;font-size:19px;line-height:1.25;margin-top:6px}.rankBody b{display:block;font-size:19px;margin-top:12px}.rankBody p{color:#a9acb3;font-size:17px;line-height:1.35;margin:10px 0 0}
      .projectionLine{color:#fff!important}.projectionLine b{display:inline!important;color:#d9b85d!important;font-size:inherit!important;margin:0!important}
      .rankGi{text-align:right}.rankGi span{display:block;color:#a9acb3;font-size:13px;font-weight:900}.rankGi strong{display:block;color:#d9b85d;font-size:26px;margin-top:3px}
      .intelButton{grid-column:2/-1;background:#080a09;color:#fff;border:4px solid #20df7f;border-radius:18px;padding:14px;font-size:19px;font-weight:700}.detail{grid-column:1/-1}
      .detail{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.detailMetric{border:1px solid #34373d;border-radius:12px;padding:10px;background:#0d0f10}.detailMetric.green{border-color:#20df7f}.detailMetric.gold{border-color:#d9b85d}.detailMetric span{display:block;color:#9da1a8;font-size:11px}.detailMetric b{display:block;margin-top:5px}
      .projectionBox{grid-column:1/-1;border:1px solid #20df7f;border-radius:12px;padding:12px;background:#0d0f10}.projectionBox span{display:block;color:#9da1a8;font-size:11px}.projectionBox strong{display:block;color:#d9b85d;font-size:22px;margin-top:4px}.projectionBox small{display:block;color:#9da1a8;margin-top:4px}
      .why{grid-column:1/-1;border-left:5px solid #20df7f;background:#151116;padding:14px}.why>b{color:#d9b85d}.why p{color:#d7d8db;line-height:1.45}.fullCard{grid-column:1/-1;text-align:center;border:2px solid #34373d;border-radius:14px;padding:13px;color:#fff!important;text-decoration:none!important;background:#0d0f10}
      .empty{padding:30px;color:#a9acb3;text-align:center}.viewFull{width:100%;background:#0d0f10;color:#fff;border:2px solid #34373d;border-radius:14px;padding:14px;font-size:17px}
      @media(max-width:600px){
        .cfbMenu{width:52px;height:52px;margin-bottom:20px}.cfbShell .hero h1{font-size:30px}.cfbShell .hero p{font-size:17px}.performanceTitle{font-size:27px!important}
        .snapshot{gap:6px}.snapshot article{padding:10px}.snapshot strong{font-size:22px}.periodTabs{grid-template-columns:repeat(5,118px)}.lineTabs button{font-size:16px;padding:12px 15px 9px}
        .rankCard{grid-template-columns:40px 92px 1fr 70px;gap:9px;padding:14px 10px;border-left-width:12px}.rankPhoto img,.rankPhoto>div{width:86px;height:86px}.rankBody strong{font-size:21px}.rankBody span,.rankBody b{font-size:16px}.rankBody p{font-size:15px}.rankGi strong{font-size:22px}
        .intelButton{grid-column:2/-1}.detail{grid-template-columns:repeat(2,1fr)}.projectionBox{grid-column:1/-1}
      }
    `}</style>
  </main>;
}
