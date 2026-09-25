"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import {useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {NHL_MARKETS,type NhlMarketKey,type NhlOverview} from "@/lib/nhl";

type Row={
  rank:number;playerId:string|number;playerName:string;teamName:string;teamLogo?:string;matchup:string;
  gameTime:string;gameId?:string;gameState?:string;gameStatus?:string;headshot:string;
  sportsbookLine:number|null;bookmakerCount:number;modelProjection:number|null;modelProbability:number|null;
  giScore:number;prediction:"OVER"|"UNDER"|null;summary:string;
  movement?:"new"|"up"|"down"|"same";previousRank?:number|null
};
type RankingResponse={success:boolean;market:NhlMarketKey;rows:Row[];updatedAt?:string;error?:string;source?:string};
type PerfResponse={connected:boolean;hits:number;settled:number;pending:number;total:number;hitRate:number|null;results:Array<{key:string;playerName:string;pickSide:string;sportsbookLine:number|null;modelProjection?:number|null;actual:number|null;status:string}>};

function useJson<T>(url:string,fallback:T,interval=120000){
  const[data,setData]=useState(fallback),[loading,setLoading]=useState(true);
  useEffect(()=>{let on=true;const run=()=>fetch(url,{cache:"no-store"}).then(r=>r.json()).then(v=>{if(on)setData(v)}).catch(()=>{}).finally(()=>on&&setLoading(false));run();const id=setInterval(run,interval);return()=>{on=false;clearInterval(id)}},[url,interval]);
  return{data,loading}
}
function ScrollTabs({children}:{children:ReactNode}){
  const ref=useRef<HTMLDivElement|null>(null);
  return <div className="tabsWrap"><div className="lineTabs" ref={ref}>{children}</div><button className="scrollCue" aria-label="Scroll prop categories" onClick={()=>ref.current?.scrollBy({left:220,behavior:"smooth"})}>›</button></div>
}
const meta=(k:NhlMarketKey)=>NHL_MARKETS.find(x=>x[0]===k)!;
const fmt=(v:number|null,d=1)=>v==null?"—":Number(v).toFixed(d);
function when(v:string){if(!v)return"Game time TBD";const d=new Date(v);return Number.isNaN(d.getTime())?"Game time TBD":new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",weekday:"short",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(d)}
function updated(v:string){const d=new Date(v);return `Updated ${new Intl.DateTimeFormat("en-US",{timeZone:"America/Toronto",month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}).format(d)}`}
function predictionText(row:Row,market:NhlMarketKey){
  if(row.modelProjection==null)return "—";
  const value=fmt(row.modelProjection);
  const labels:Record<string,string>={
    shots_on_goal:"shots on goal",points:"points",goals:"goals",assists:"assists",blocked_shots:"blocked shots",goalie_saves:"saves"
  };
  return `${value} ${labels[market]||meta(market)[2]}`;
}

function Card({row,market}:{row:Row;market:NhlMarketKey}){
  const[open,setOpen]=useState(false);
  const prediction=predictionText(row,market);
  const confidence=row.modelProbability==null?"—":`${fmt(row.modelProbability)}%`;

  return <article className="rankCard">
    <div className="rankNo">#{row.rank}<span className={`move ${row.movement||"same"}`}>{row.movement==="new"?"NEW":row.movement==="up"?`↑ ${Math.max(1,Number(row.previousRank||row.rank)-row.rank)}`:row.movement==="down"?`↓ ${Math.max(1,row.rank-Number(row.previousRank||row.rank))}`:"−"}</span></div>
    <div className="rankPhoto">{row.headshot?<img src={row.headshot} alt=""/>:<div>NHL</div>}{row.teamLogo?<img className="teamLogo" src={row.teamLogo} alt=""/>:null}</div>
    <div className="rankBody">
      <strong>{row.playerName}</strong>
      <span>{row.teamName}{row.matchup?` · ${row.matchup}`:""}</span>
      <span className="gameWhen">🗓 {when(row.gameTime)}</span>

      {row.gameState==="in"?<div className="liveProgress"><b>● LIVE</b><span>{row.gameStatus||"In progress"}</span></div>:row.gameState==="post"?<p className="finalResult"><b>FINAL</b><span>Final stat grading updates from saved prediction history.</span></p>:null}

      <p className="projectionLine"><b>Sach Prediction:</b> {prediction}</p>
      <p className="confidenceLine"><b>Confidence:</b> {confidence}</p>
    </div>

    <div className="rankGi"><span>GI</span><strong>{fmt(row.giScore)}</strong></div>

    <button className="intelButton" onClick={()=>setOpen(v=>!v)}>ⓘ {open?"Hide":"View"} Intelligence</button>

    {open?<div className="detail">
      <div className="detailMetric green"><span>CONFIDENCE</span><b>{confidence}</b></div>
      <div className="detailMetric"><span>REFERENCE LINE</span><b>{row.sportsbookLine??"—"}</b></div>
      <div className="detailMetric gold"><span>BOOKS</span><b>{row.bookmakerCount}</b></div>
      <div className="projectionBox"><span>SACH PREDICTION</span><strong>{prediction}</strong></div>
      <div className="why"><b>Why This Player Ranks Here</b><p>{row.summary}</p></div>
      <Link className="fullCard" href={`/nhl/player/${encodeURIComponent(String(row.playerId))}?market=${market}&name=${encodeURIComponent(row.playerName)}&line=${row.sportsbookLine??""}&projection=${row.modelProjection??""}&gi=${row.giScore}&prob=${row.modelProbability??""}&pick=${row.prediction??""}&team=${encodeURIComponent(row.teamName)}&matchup=${encodeURIComponent(row.matchup||"")}&gameTime=${encodeURIComponent(row.gameTime||"")}&status=${encodeURIComponent(row.gameStatus||"")}&books=${row.bookmakerCount}&summary=${encodeURIComponent(row.summary||"")}&photo=${encodeURIComponent(row.headshot||"")}&logo=${encodeURIComponent(row.teamLogo||"")}`}>Open full player card</Link>
    </div>:null}
  </article>
}

export function NhlDashboard({data}:{data:NhlOverview}){
  const[market,setMarket]=useState<NhlMarketKey>("shots_on_goal");
  const[performanceMarket,setPerformanceMarket]=useState<NhlMarketKey>("shots_on_goal");
  const[full,setFull]=useState(false);
  const[period,setPeriod]=useState("Today");
  const[movementRows,setMovementRows]=useState<Row[]>([]);
  const[captureTick,setCaptureTick]=useState(0);

  const r=useJson<RankingResponse>(`/api/nhl/rankings?market=${market}`,{success:false,market,rows:[]},180000);
  const raw=r.data.rows||[];
  const overallPerf=useJson<PerfResponse>(`/api/nhl/performance?period=${period}&capture=${captureTick}`,{connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,results:[]},60000);
  const marketPerf=useJson<PerfResponse>(`/api/nhl/performance?market=${performanceMarket}&period=${period}&capture=${captureTick}`,{connected:false,hits:0,settled:0,pending:0,total:0,hitRate:null,results:[]},60000);

  useEffect(()=>{
    let live=true;
    fetch("/api/nhl/capture",{method:"POST",cache:"no-store"})
      .then(()=>{if(live)setCaptureTick(Date.now())})
      .catch(()=>{});
    return()=>{live=false};
  },[]);

  useEffect(()=>{
    if(!r.data.success)return;
    const key=`nhl-rank-history-${market}`,eventsKey=`nhl-rank-events-${market}`;
    let prev:Record<string,{rank:number}>={},events:Record<string,{movement:Row["movement"];previousRank:number|null}>={};
    try{prev=JSON.parse(localStorage.getItem(key)||"{}");events=JSON.parse(localStorage.getItem(eventsKey)||"{}")}catch{}
    const current:Record<string,{rank:number}>={};
    const next=raw.map(x=>{
      const id=String(x.playerId||x.playerName);
      current[id]={rank:x.rank};
      const old=prev[id];
      if(!old)events[id]={movement:"new",previousRank:null};
      else if(old.rank!==x.rank)events[id]={movement:x.rank<old.rank?"up":"down",previousRank:old.rank};
      else events[id]={movement:"same",previousRank:old.rank};
      return{...x,movement:events[id]?.movement||"same",previousRank:events[id]?.previousRank??null}
    });
    setMovementRows(next);
    try{localStorage.setItem(key,JSON.stringify(current));localStorage.setItem(eventsKey,JSON.stringify(events))}catch{}
  },[r.data.success,r.data.updatedAt,market]); // eslint-disable-line react-hooks/exhaustive-deps

  const gamesToday=useMemo(()=>{
    const today=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto"}).format(new Date());
    return data.games.filter(g=>g.tipoff&&new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto"}).format(new Date(g.tipoff))===today)
  },[data.games]);

  const live=gamesToday.filter(g=>g.state==="in").length;
  const rows=movementRows.length?movementRows:raw;

  return <main className="nhlShell">
    <section className="hero"><div className="heroTop"><Link href="/" className="nhlMenu">▦⌄</Link><h1>NHL Intelligence Center</h1></div><p>Today’s strongest NHL player and goalie projections with matchup intelligence in one place.</p></section>
    <div className="updated">{updated(data.updatedAt)}</div>

    <Link className="gamesEntry" href="/nhl/games"><b>🏒 TODAY’S NHL GAMES</b><span>Schedule · Matchups · Game status ›</span></Link>

    <div className="snapshotHeading"><h2>Today’s NHL Snapshot</h2><span>Skaters + goalies</span></div>
    <div className="snapshot">
      <article className="green"><span>GAMES</span><strong>{gamesToday.length}</strong><small>{live} live</small></article>
      <article><span>RANKED PLAYERS</span><strong>{r.data.success?rows.length:"—"}</strong><small>{meta(market)[1]}</small></article>
      <article className="gold"><span>DATA SOURCE</span><strong>{r.data.success?"LIVE":"—"}</strong><small>Owls Insight</small></article>
    </div>

    {data.warnings.map(w=><div className="dataWarning" key={w}>{w}</div>)}

    <section className="section performance">
      <h2 className="performanceTitle">📊 Prediction Performance</h2>
      <details><summary>ⓘ How performance is measured</summary><div className="explain">Predictions are saved before the game and graded after final results. The ranking card shows Sach’s projected stat; reference lines remain inside Intelligence for internal grading context.</div></details>
      <h3>🌐 Overall NHL Performance</h3>
      <div className="periodTabs">{["Today","Yesterday","Week","Month","Season"].map(x=><button className={period===x?"active":""} onClick={()=>setPeriod(x)} key={x}>{x}</button>)}</div>
      <div className="overallMetrics">
        <article className="green"><span>Hit Rate</span><strong>{overallPerf.data.hitRate==null?"—":`${overallPerf.data.hitRate}%`}</strong></article>
        <article><span>Correct / Settled</span><strong>{overallPerf.data.connected?`${overallPerf.data.hits} / ${overallPerf.data.settled}`:"—"}</strong></article>
        <article className="gold"><span>Pending</span><strong>{overallPerf.data.connected?overallPerf.data.pending:"—"}</strong></article>
      </div>
      <ScrollTabs>{NHL_MARKETS.map(([k,label])=><button className={performanceMarket===k?"active":""} onClick={()=>setPerformanceMarket(k)} key={`perf-${k}`}>{label}</button>)}</ScrollTabs>
      <div className="marketMetrics">
        <article className="green"><span>Hits / Predictions</span><strong>{marketPerf.data.connected?`${marketPerf.data.hits} / ${marketPerf.data.total}`:"—"}</strong></article>
        <article><span>Pending</span><strong>{marketPerf.data.connected?marketPerf.data.pending:"—"}</strong></article>
        <article className="gold"><span>Settled</span><strong>{marketPerf.data.connected?marketPerf.data.settled:"—"}</strong></article>
        <article><span>Hit Rate</span><strong>{marketPerf.data.hitRate==null?"—":`${marketPerf.data.hitRate}%`}</strong></article>
      </div>
      {!marketPerf.data.results.length?<p className="perfNote">No saved {meta(performanceMarket)[1]} predictions for this period yet.</p>:null}
    </section>

    <section className="section rankings">
      <div className="rankHeader"><h2>Player Rankings</h2><p>Model projections · matchup intelligence</p></div>
      <ScrollTabs>{NHL_MARKETS.map(([k,label])=><button className={market===k?"active":""} onClick={()=>{setMarket(k);setFull(false)}} key={k}>{label}</button>)}</ScrollTabs>
      <div className="marketHead"><h2>{meta(market)[1]} Rankings</h2><p>GI combines the model projection, 2026 statistical baseline, matchup context and sample reliability.</p></div>
      {r.data.error?<div className="dataWarning">{r.data.error}</div>:null}
      <div className="cards">{(full?rows:rows.slice(0,5)).map(x=><Card row={x} market={market} key={`${x.playerId}-${x.rank}`}/>)}</div>
      {!r.loading&&!rows.length?<div className="empty">No verified {meta(market)[1]} rankings are currently available.</div>:null}
      {rows.length>5?<button className="viewFull" onClick={()=>setFull(v=>!v)}>{full?"Show Top 5 Only":"See Full Top 25"}</button>:null}
    </section>

    <style jsx global>{`
      .nhlShell{max-width:780px;margin:0 auto;padding:8px 14px 72px;color:#fff}
      .hero{border:2px solid #d9b85d;border-radius:18px;padding:13px 15px;background:linear-gradient(110deg,rgba(217,184,93,.42),#0b0d0e 48%,rgba(0,78,47,.72))}
      .heroTop{display:flex;align-items:center;gap:12px}.nhlMenu{display:grid;place-items:center;flex:0 0 44px;width:44px;height:44px;border:2px solid #20df7f;border-radius:13px;background:#0c0e0d;color:#fff!important;text-decoration:none!important;font-size:18px}
      .hero h1{font-size:28px;margin:0;font-weight:900}.hero p{margin:7px 0 0;color:#c8c8ce;line-height:1.3;font-size:15px}
      .updated{text-align:right;color:#9a9da4;margin:5px 2px 10px;font-size:12px;font-weight:700}
      .gamesEntry{display:flex;flex-direction:column;gap:2px;border:1.5px solid #d9b85d;border-left:7px solid #20df7f;border-radius:15px;padding:11px 14px;color:#fff!important;text-decoration:none!important;background:#0d0f10}.gamesEntry b{font-size:18px}.gamesEntry span{font-size:14px;color:#d4d5d8}
      .snapshotHeading{display:flex;align-items:end;justify-content:space-between;gap:10px;margin:11px 0 8px}.snapshotHeading h2{font-size:23px;margin:0}.snapshotHeading span{color:#20df7f;font-size:11px;font-weight:800}
      .snapshot{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.snapshot article,.overallMetrics article,.marketMetrics article{border:1.5px solid #34373d;border-radius:15px;padding:8px;background:#111214;display:flex;flex-direction:column;gap:4px;min-width:0}.snapshot .green,.overallMetrics .green,.marketMetrics .green{border-color:#20df7f}.snapshot .gold,.overallMetrics .gold,.marketMetrics .gold{border-color:#d9b85d}.snapshot span,.overallMetrics span,.marketMetrics span{color:#9da1a8;font-size:11px}.snapshot strong,.overallMetrics strong,.marketMetrics strong{font-size:22px}.snapshot small{color:#d0d1d4;font-size:11px}
      .section{margin-top:24px}.performanceTitle{font-size:27px!important;line-height:1.05!important;margin:0 0 9px!important}.section details{border:1.5px solid #34373d;border-radius:14px;padding:10px 12px;margin:9px 0 12px}.section summary{font-size:15px}.explain{color:#a9acb3;margin-top:8px;font-size:13px;line-height:1.35}.perfNote{margin:4px 0 10px;color:#9da1a8;font-size:12px}
      .periodTabs{display:grid;grid-template-columns:repeat(5,1fr)}.periodTabs button{min-width:0;background:#111319;border:1px solid #383b42;color:#fff;padding:10px 3px;font-size:12px;font-weight:700}.periodTabs button.active{background:#351015;border-color:#f04f5f}
      .performance h3{font-size:20px;margin:14px 0 7px}.overallMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:9px 0 5px}.marketMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:9px 0 4px}.marketMetrics article{padding:9px 7px}.marketMetrics span{font-size:10px;white-space:normal;line-height:1.1}.marketMetrics strong{font-size:19px}
      .rankHeader{background:#0c0d0e;padding:12px 14px}.rankHeader h2{font-size:27px;margin:0}.rankHeader p,.marketHead p{margin:2px 0 0;color:#a9acb3;font-size:14px}
      .tabsWrap{position:relative;padding-right:30px;border-bottom:2px solid #34373d}.lineTabs{display:flex;overflow-x:auto;scrollbar-width:none}.lineTabs::-webkit-scrollbar{display:none}.lineTabs button{flex:0 0 auto;white-space:nowrap;background:transparent;border:0;border-bottom:3px solid transparent;color:#fff;padding:10px 14px 8px;font-size:14px;font-weight:800}.lineTabs button.active{border-bottom-color:#f04f5f}.scrollCue{position:absolute;right:0;top:0;bottom:0;width:30px;border:1px solid #34373d;background:#0f1115;color:#d9b85d;font-size:25px}
      .marketHead h2{font-size:24px;margin:16px 0 5px}
      .rankCard{display:grid;grid-template-columns:38px 78px 1fr 55px;gap:8px;border:3px solid #34373d;border-left:10px solid #20df7f;border-radius:20px;background:#111214;padding:11px 9px;margin:12px 0}
      .rankNo{font-size:21px;font-weight:900}.rankNo span{display:block;margin-top:6px;font-size:10px;color:#9da1a8}.rankNo .new{color:#d9b85d}.rankNo .up{color:#20df7f}.rankNo .down{color:#ff6b6b}
      .rankPhoto{position:relative}.rankPhoto img,.rankPhoto>div{width:74px;height:74px;border-radius:50%;border:3px solid #d9b85d;object-fit:cover}.rankPhoto .teamLogo{position:absolute;right:-2px;bottom:-2px;width:26px!important;height:26px!important;border:2px solid #20df7f!important;background:#111214;object-fit:contain}.rankPhoto>div{display:grid;place-items:center;color:#d9b85d;font-weight:900}
      .rankBody strong{display:block;font-size:18px}.rankBody span{display:block;color:#a9acb3;font-size:13px;margin-top:3px}.rankBody b{display:block;font-size:14px;margin-top:7px}.rankBody p{color:#a9acb3;font-size:12px;margin:5px 0 0}
      .projectionLine{color:#fff!important;font-weight:800}.projectionLine b{display:inline!important;color:#d9b85d!important;margin:0!important}.confidenceLine{color:#fff!important}.confidenceLine b{display:inline!important;color:#20df7f!important;margin:0!important}
      .rankGi{text-align:right}.rankGi span{display:block;color:#a9acb3;font-size:10px;font-weight:900}.rankGi strong{display:block;color:#d9b85d;font-size:19px}
      .intelButton{grid-column:2/-1;background:#080a09;color:#fff;border:2.5px solid #20df7f;border-radius:14px;padding:9px;font-size:15px;font-weight:700}
      .detail{grid-column:1/-1;display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.detailMetric,.why,.projectionBox{border:1px solid #34373d;border-radius:10px;padding:8px;background:#0d0f10}.detailMetric.green{border-color:#20df7f}.detailMetric.gold{border-color:#d9b85d}.detailMetric span,.projectionBox span{display:block;color:#9da1a8;font-size:9px}.projectionBox{grid-column:1/-1;border-color:#20df7f}.projectionBox strong{display:block;color:#d9b85d;font-size:18px;margin-top:3px}.why{grid-column:1/-1;border-left:4px solid #20df7f}.why>b{color:#d9b85d}.why p{color:#d7d8db;font-size:12px}.fullCard{grid-column:1/-1;text-align:center;border:1.5px solid #34373d;border-radius:11px;padding:9px;color:#fff!important;text-decoration:none!important}
      .liveProgress{margin-top:7px;border:1px solid #20df7f;border-radius:10px;padding:7px;background:rgba(32,223,127,.06)}.liveProgress b{color:#20df7f!important;margin:0 0 3px!important;font-size:12px!important}.finalResult b{color:#d9b85d}
      .dataWarning{margin:12px 0;padding:10px;border:1px solid #8d6f2f;border-radius:10px;background:#1a160c;color:#e4c978}.empty{padding:20px;color:#a9acb3;text-align:center}.viewFull{width:100%;background:#0d0f10;color:#fff;border:1.5px solid #34373d;border-radius:12px;padding:10px}
      @media(max-width:430px){.marketMetrics{grid-template-columns:repeat(4,minmax(84px,1fr));overflow-x:auto}.hero h1{font-size:24px}.hero p{font-size:14px}.snapshotHeading h2{font-size:20px}.rankCard{grid-template-columns:32px 68px 1fr 48px;gap:6px}.rankPhoto img,.rankPhoto>div{width:64px;height:64px}.rankBody strong{font-size:16px}.rankBody span,.rankBody b{font-size:12px}.detail{grid-template-columns:repeat(3,1fr)}}
    `}</style>
  </main>
}
