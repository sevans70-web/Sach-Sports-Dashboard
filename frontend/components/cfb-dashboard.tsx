"use client";

import Link from "next/link";
import {useEffect,useMemo,useRef,useState,type ReactNode} from "react";
import {CFB_MARKETS,type CfbMarketKey,type CfbRankingRow} from "@/lib/cfb";

type Row=CfbRankingRow&{
  movement?:number|"NEW";
  frozen?:boolean;
  resultStatus?:string;
  actualResult?:number|null;
  resultSymbol?:string;
};

type CfbPerformanceResponse={
  success:boolean;
  connected:boolean;
  hits:number;
  settled:number;
  pending:number;
  hitRate:number|null;
  total?:number;
};

type ScheduleResponse={success:boolean;games:any[];qualifiedCount:number;filterMode?:string};
type RankingResponse={success:boolean;rows:Row[];dropped?:any[]};

type LiveResponse={
  success:boolean;
  games:Array<{
    gameId:string;
    matchup:string;
    state:string;
    completed:boolean;
    status:string;
    quarter:string;
    clock:string;
    rows:Array<{playerId:string;playerName:string;value:number}>;
  }>;
};

const QB_MARKETS:CfbMarketKey[]=["passing_yards","pass_completions"];
const OFFENSE_MARKETS:CfbMarketKey[]=["rushing_yards","receiving_yards","receptions","anytime_td","first_td"];

function useJson<T>(url:string,fallback:T,intervalMs=60000){
  const[data,setData]=useState(fallback),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true,running=false,controller:AbortController|null=null;
    const run=async()=>{
      if(running)return;
      running=true;
      controller=new AbortController();
      const timer=setTimeout(()=>controller?.abort(),12000);
      try{
        const response=await fetch(url,{cache:"no-store",signal:controller.signal});
        const value=await response.json();
        if(active&&response.ok)setData(value);
      }catch{}finally{
        clearTimeout(timer);
        running=false;
        if(active)setLoading(false);
      }
    };
    run();
    const id=setInterval(run,intervalMs);
    return()=>{active=false;clearInterval(id);controller?.abort()}
  },[url,intervalMs]);
  return{data,loading};
}

function meta(k:CfbMarketKey){return CFB_MARKETS.find(x=>x[0]===k)!}
function ScrollTabs({children}:{children:ReactNode}){
  const ref=useRef<HTMLDivElement|null>(null);
  return <div className="tabsWrap"><div className="tabs" ref={ref}>{children}</div><button className="scrollCue" aria-label="Scroll prop categories" onClick={()=>ref.current?.scrollBy({left:220,behavior:"smooth"})}>›</button></div>;
}


function projectionText(row:Row,m:CfbMarketKey){
  if(m==="first_td")return row.modelProbability!=null?`${Number(row.modelProbability).toFixed(0)}% chance`:"Model unavailable";
  const v=row.modelProjection;
  if(v==null||!Number.isFinite(Number(v)))return "Insufficient history";
  const n=Number(v);
  if(["passing_yards","rushing_yards","receiving_yards"].includes(m))return `${n.toFixed(1)} yds`;
  if(m==="pass_completions")return `${n.toFixed(1)} comp`;
  if(m==="receptions")return `${n.toFixed(1)} rec`;
  if(m==="anytime_td")return `${n.toFixed(1)} TD`;
  return n.toFixed(1);
}

function unit(m:CfbMarketKey){
  if(["passing_yards","rushing_yards","receiving_yards"].includes(m))return "yards";
  if(m==="pass_completions")return "completions";
  if(m==="receptions")return "receptions";
  if(m==="anytime_td"||m==="first_td")return "TD";
  return "";
}

function gameTime(v?:string){
  if(!v)return "";
  const d=new Date(v);
  if(Number.isNaN(d.getTime()))return "";
  return new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Toronto",
    month:"2-digit",
    day:"2-digit",
    hour:"numeric",
    minute:"2-digit",
    timeZoneName:"short",
  }).format(d);
}

function move(v?:number|"NEW"){
  if(v==="NEW")return "NEW";
  const n=Number(v||0);
  return n>0?`↑${n}`:n<0?`↓${Math.abs(n)}`:"—";
}

function clean(v:any){
  return String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
}

function quarterLabel(value?:string){
  const q=String(value||"").toUpperCase();
  if(q==="Q1")return "Quarter 1";
  if(q==="Q2")return "Quarter 2";
  if(q==="Q3")return "Quarter 3";
  if(q==="Q4")return "Quarter 4";
  if(q==="HALF")return "Halftime";
  if(q.startsWith("OT"))return q==="OT"?"Overtime":`Overtime ${q.replace("OT","")}`;
  return q;
}

function liveFor(row:Row,live:LiveResponse){
  const game=live.games?.find(g=>clean(g.matchup)===clean(row.matchup));
  if(!game)return null;
  const stat=game.rows?.find(x=>
    (row.playerId&&String(x.playerId)===String(row.playerId))||
    clean(x.playerName)===clean(row.playerName)
  );
  return {...game,actual:stat?.value??null};
}


function Card({row,market,live}:{row:Row;market:CfbMarketKey;live:LiveResponse}){
  const[open,setOpen]=useState(false);
  const proj=projectionText(row,market);
  const displayName=String(row.playerName||"").replace(/\s*\([A-Z0-9 .'-]+\)\s*$/,"").trim();
  const lg=liveFor(row,live);
  const actual=lg?.actual??null;
  const confidence=row.modelProbability!=null?`${Number(row.modelProbability).toFixed(0)}%`:"—";
  const progress=row.modelProjection!=null&&actual!=null&&Number(row.modelProjection)>0
    ?Math.max(0,Math.min(100,(Number(actual)/Number(row.modelProjection))*100))
    :0;

  return <article className={`rankCard ${lg?.state==="in"?"isLive":""}`}>
    <div className="rankNo">#{row.rank}<span className={row.movement==="NEW"?"new":Number(row.movement||0)>0?"up":Number(row.movement||0)<0?"down":""}>{move(row.movement)}</span></div>
    <div className="rankPhoto">{row.headshot?<img src={row.headshot} alt=""/>:<div>CFB</div>}</div>
    <div className="rankBody">
      <strong>{displayName}</strong>
      <span>{row.teamName}{row.position?` · ${row.position}`:""}</span>
      {row.matchup?<span>{row.matchup}</span>:null}
      {row.gameTime?<span className="gameTime">🗓️ {gameTime(row.gameTime)}</span>:null}
      {lg?.state==="in"?<div className="livePanel"><div className="liveHeader">● LIVE · {quarterLabel(lg.quarter)}{lg.clock?` · ${lg.clock}`:""}</div><div className="liveCurrent">Current: <b>{actual??"—"} {unit(market)}</b></div><div className="progressTrack"><div className="progressFill" style={{width:`${progress}%`}}/></div></div>:null}
      {lg?.completed?<div className="finalPanel"><div className="finalHeader">FINAL</div><div>Actual: <b>{actual??"—"} {unit(market)}</b></div></div>:null}
      <p className="projectionLine"><b>Sach Prediction:</b> {proj}</p>
      <p className="confidenceLine"><b>Confidence:</b> {confidence}</p>
      {row.frozen?<span className="locked">LOCKED AT KICKOFF</span>:null}
    </div>
    <div className="rankGi"><span>GI SCORE</span><strong>{Number(row.giScore||0).toFixed(1)}</strong></div>
    <button className="intelButton" onClick={()=>setOpen(v=>!v)}>{open?"ⓘ Hide Intelligence":"ⓘ View Intelligence"}</button>
    {open?<div className="detail">
      <div><span>CONFIDENCE</span><b>{row.modelProbability!=null?`${Number(row.modelProbability).toFixed(1)}%`:"—"}</b></div>
      <div><span>REFERENCE LINE</span><b>{row.sportsbookLine??"—"}</b></div>
      <div><span>BOOKS</span><b>{row.bookmakerCount||0}</b></div>
      <div><span>POSITION</span><b>{row.position||"—"}</b></div>
      <section><span>SACH PREDICTION</span><strong>{proj}</strong>{row.projectionGames?<small>Recent sample: {row.projectionGames} games</small>:null}</section>
      <p>{row.summary}</p>
      <Link href={`/cfb/player/${encodeURIComponent(row.playerId)}?market=${encodeURIComponent(market)}&name=${encodeURIComponent(row.playerName)}&team=${encodeURIComponent(row.teamName)}&matchup=${encodeURIComponent(row.matchup)}&gi=${row.giScore}&prob=${row.modelProbability??""}&line=${row.sportsbookLine??""}&projection=${encodeURIComponent(String(row.modelProjection??""))}&img=${encodeURIComponent(row.headshot||"")}&position=${encodeURIComponent(row.position||"")}&teamId=${encodeURIComponent(row.teamId||"")}`}>Open full player card</Link>
    </div>:null}
  </article>;
}

export default function CfbDashboard(){
  const[group,setGroup]=useState<"QB"|"Offense">("QB");
  const[market,setMarket]=useState<CfbMarketKey>("passing_yards");
  const[period,setPeriod]=useState("Today");
  const[full,setFull]=useState(false);
  const[captureTick,setCaptureTick]=useState(0);

  const s=useJson<ScheduleResponse>("/api/cfb/schedule",{success:false,games:[],qualifiedCount:0},30000);
  const r=useJson<RankingResponse>(`/api/cfb/rankings?market=${market}`,{success:false,rows:[]},120000);
  const live=useJson<LiveResponse>(`/api/cfb/live?market=${market}`,{success:false,games:[]},15000);
  const overall=useJson<CfbPerformanceResponse>(`/api/cfb/performance?period=${period}&group=${group}&capture=${captureTick}`,{success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null},60000);
  const perf=useJson<CfbPerformanceResponse>(`/api/cfb/performance?period=${period}&group=${group}&market=${market}&capture=${captureTick}`,{success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null},60000);

  const rows=useMemo(()=>{
    const source=r.data.rows||[];
    const valid=source.filter((row:Row)=>{
      if(market==="first_td")return row.modelProbability!=null&&Number.isFinite(Number(row.modelProbability));
      return row.modelProjection!=null&&Number.isFinite(Number(row.modelProjection));
    });
    return valid.map((row:Row,index:number)=>({...row,rank:index+1}));
  },[r.data,market]);
  const markets=group==="QB"?QB_MARKETS:OFFENSE_MARKETS;
  const active=meta(market);

  useEffect(()=>{
    let active=true;
    Promise.allSettled(CFB_MARKETS.map(([key])=>fetch(`/api/cfb/rankings?market=${key}`,{cache:"no-store"})))
      .then(()=>{if(active)setCaptureTick(Date.now())})
      .catch(()=>{});
    return()=>{active=false};
  },[]);

  useEffect(()=>{
    if(!markets.includes(market))setMarket(markets[0]);
    setFull(false);
  },[group]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(()=>setFull(false),[market]);

  const liveGames=s.data.games.filter((g:any)=>g.state==="in").length;
  const finals=s.data.games.filter((g:any)=>g.completed).length;
  const gameCount=s.data.filterMode==="schedule_fallback"?s.data.games.length:s.data.qualifiedCount;

  return <main className="cfbShell">
    <Link href="/" className="cfbMenu">▦⌄</Link>

    <section className="hero">
      <h1>CFB Intelligence Center</h1>
      <p>Start with the strongest players in each supported college market, review the reason behind every ranking, and open the full rankings only when you need more depth.</p>
    </section>

    <div className="updated">Last updated Live</div>

    <Link className="gamesEntry" href="/cfb/games">
      <b>🏈 THIS WEEK&apos;S CFB GAMES</b>
      <span>Open the slate, team rosters &amp; Game Intelligence ›</span>
    </Link>

    <h2>This Week&apos;s CFB Snapshot</h2>

    <div className="snapshot">
      <article><span>GAMES</span><strong>{gameCount}</strong><small>{liveGames} live · {finals} final</small></article>
      <article><span>MARKETS</span><strong>7</strong><small>College-supported categories</small></article>
      <article><span>ALERTS</span><strong>0</strong><small>No active alerts</small></article>
    </div>

    <section className="section performanceSection">
      <h2 className="performanceTitle">📊 Prediction Performance</h2>
      <details className="performanceInfo"><summary>▶ ⓘ How performance is measured</summary><div className="performanceExplain">Predictions are saved before kickoff, frozen when the game starts, and graded after final results. Today may be empty when no CFB games are scheduled; Week, Month and Season retain saved history.</div></details>

      <div className="tabs groupTabs">
        <button className={group==="QB"?"active":""} onClick={()=>setGroup("QB")}>🏈 QB</button>
        <button className={group==="Offense"?"active":""} onClick={()=>setGroup("Offense")}>🏃 Offense</button>
      </div>

      <h3>🌐 Overall CFB {group} Performance</h3>

      <div className="periodTabs">
        {["Today","Yesterday","Week","Month","Season"].map(x=>
          <button className={period===x?"active":""} onClick={()=>setPeriod(x)} key={x}>{x}</button>
        )}
      </div>

      <div className="overallMetrics">
        <article className="green"><span>Hit Rate</span><strong>{overall.data.hitRate==null?"—":`${overall.data.hitRate}%`}</strong></article>
        <article><span>Correct / Settled</span><strong>{overall.data.hits} / {overall.data.settled}</strong></article>
        <article className="gold"><span>Pending</span><strong>{overall.data.pending}</strong></article>
      </div>

      <ScrollTabs>
        {markets.map(k=>{
          const m=meta(k);
          return <button className={market===k?"active":""} onClick={()=>setMarket(k)} key={k}>{m[1]} {m[2]}</button>;
        })}
      </ScrollTabs>

      <div className="marketMetrics">
        <article className="green"><span>Hits / Predictions</span><strong>{perf.data.hits} / {perf.data.total||0}</strong></article>
        <article><span>Pending</span><strong>{perf.data.pending}</strong></article>
        <article className="gold"><span>Settled</span><strong>{perf.data.settled}</strong></article>
        <article><span>Hit Rate</span><strong>{perf.data.hitRate==null?"—":`${perf.data.hitRate}%`}</strong></article>
      </div>
    </section>

    <section className="section">
      <div className="rankHeader">
        <h2>Player Rankings</h2>
        <p>Market-specific intelligence · live matchup context</p>
      </div>

      <div className="tabs">
        <button className={group==="QB"?"active":""} onClick={()=>setGroup("QB")}>🏈 QB</button>
        <button className={group==="Offense"?"active":""} onClick={()=>setGroup("Offense")}>🏃 Offense</button>
      </div>

      <ScrollTabs>
        {markets.map(k=>{
          const m=meta(k);
          return <button className={market===k?"active":""} onClick={()=>setMarket(k)} key={k}>{m[1]} {m[2]}</button>;
        })}
      </ScrollTabs>

      <h2>{active[1]} {active[2]} Rankings</h2>

      {r.data.dropped?.length?
        <details className="droppedTop25">
          <summary>👁 Dropped from Top 25 ({r.data.dropped.length})</summary>
          <div className="droppedList">
            {r.data.dropped.map((x:any)=>
              <span key={String(x.playerId||x.playerName)}>
                {x.playerName}{x.teamName?` (${x.teamName})`:""}
              </span>
            )}
          </div>
        </details>:null}

      {(full?rows:rows.slice(0,5)).map(row=>
        <Card row={row} market={market} live={live.data} key={`${row.playerId}-${row.rank}`}/>
      )}

      {!r.loading&&rows.length===0?<div className="empty">Ranking data is temporarily unavailable.</div>:null}

      {rows.length>5?
        <button className="viewFull" onClick={()=>setFull(v=>!v)}>
          {full?"Show Top 5 Only":"View Full Rankings"}
        </button>:null}
    </section>

    <style jsx global>{`
      .cfbShell{max-width:780px;margin:0 auto;padding:10px 14px 80px;color:#fff}
      .cfbMenu{display:grid;place-items:center;width:58px;height:58px;border:2px solid #20df7f;border-radius:16px;background:#0c0e0d;color:#fff;text-decoration:none;margin-bottom:24px}
      .hero{border:2px solid #d9b85d;border-radius:18px;padding:18px 20px;background:linear-gradient(110deg,rgba(217,184,93,.42),#0b0d0e 48%,rgba(0,78,47,.7))}
      .hero h1{margin:0 0 10px}
      .updated{text-align:right;color:#9498a0;margin:8px 0 16px}
      .gamesEntry{display:flex;flex-direction:column;gap:5px;border:2px solid #d9b85d;border-left:10px solid #20df7f;border-radius:18px;padding:18px 20px;color:#fff;text-decoration:none}
      .snapshot{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .snapshot article{border:2px solid #34373d;border-radius:18px;padding:14px;background:#111214;display:flex;flex-direction:column;gap:8px}.overallMetrics article,.marketMetrics article{border:1.5px solid #34373d;border-radius:15px;padding:8px;background:#111214;display:flex;flex-direction:column;gap:4px;min-width:0}.overallMetrics span,.marketMetrics span{color:#9da1a8;font-size:11px}.overallMetrics strong,.marketMetrics strong{font-size:22px}
      .overallMetrics .green,.marketMetrics .green{border-color:#20df7f}.overallMetrics .gold,.marketMetrics .gold{border-color:#d9b85d}
      .overallMetrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:9px 0 5px}.marketMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:9px 0 4px}.marketMetrics article{padding:9px 7px}.marketMetrics span{font-size:10px;white-space:normal;line-height:1.1}.marketMetrics strong{font-size:19px}
      .section{margin-top:34px}
      .tabs{display:flex;overflow-x:auto;border-bottom:2px solid #34373d}
      .tabs button{flex:0 0 auto;background:transparent;border:0;border-bottom:4px solid transparent;color:#fff;padding:13px 18px;font-weight:800}
      .tabs button.active{border-bottom-color:#f04f5f}
      .rankHeader{background:#0c0d0e;padding:20px;margin-top:8px}
      .rankCard{position:relative;display:grid;grid-template-columns:38px 78px 1fr 55px;gap:8px;border:3px solid #34373d;border-left:10px solid #20df7f;border-radius:20px;background:#111214;padding:11px 9px;margin:12px 0}
      .rankCard.isLive{box-shadow:0 0 0 2px rgba(32,223,127,.35),0 0 20px rgba(32,223,127,.18)}
      .rankNo{font-size:21px;font-weight:900}
      .rankNo span{display:block;margin-top:6px;color:#9da1a8;font-size:10px}
      .rankNo .up{color:#20df7f}
      .rankNo .down{color:#ff6b6b}
      .rankNo .new{color:#d9b85d;font-size:13px}
      .rankPhoto img,.rankPhoto>div{width:74px;height:74px;border-radius:50%;border:3px solid #d9b85d;object-fit:cover}
      .rankPhoto>div{display:grid;place-items:center}
      .rankBody strong{display:block;font-size:18px}
      .rankBody span{display:block;color:#a9acb3;font-size:13px;margin-top:3px}
      .rankBody b{display:block;font-size:14px;margin-top:7px}
      .rankBody p{color:#a9acb3;font-size:12px;margin:5px 0 0}
      .gameTime{color:#d9b85d!important;font-weight:800!important;font-size:11px!important}
      .livePanel{margin-top:12px;border:2px solid #20df7f;border-radius:16px;padding:12px;background:rgba(0,55,34,.25)}
      .liveHeader{color:#20df7f;font-weight:900;font-size:18px}
      .liveCurrent{margin-top:7px;color:#fff}
      .liveCurrent b{display:inline;margin:0}
      .progressTrack{height:10px;border-radius:999px;background:#3b3f44;margin-top:10px;overflow:hidden}
      .progressFill{height:100%;background:#20df7f;border-radius:999px}
      .finalPanel{margin-top:12px;border:2px solid #34373d;border-radius:16px;padding:12px}
      .finalPanel.hit{border-color:#20df7f}
      .finalPanel.miss{border-color:#ff6b6b}
      .finalPanel.push{border-color:#d9b85d}
      .finalHeader{font-weight:900;margin-bottom:7px}
      .projectionLine{color:#fff!important;font-weight:800}.projectionLine b{color:#d9b85d}.confidenceLine{color:#fff!important}.confidenceLine b{color:#20df7f}
      .predictionLine b{color:#d9b85d}
      .predictionLine.over{color:#20df7f}
      .predictionLine.under{color:#fff}
      .predictionLine span{display:inline!important;color:#a9acb3!important}
      .locked{display:inline-block!important;width:max-content;padding:3px 8px;border:1px solid #20df7f;border-radius:999px;color:#20df7f!important;font-size:11px}
      .rankGi{text-align:right}
      .rankGi span{display:block;color:#a9acb3;font-size:10px;font-weight:900}.rankGi strong{display:block;color:#d9b85d;font-size:19px;margin-top:2px}
      .intelButton{grid-column:2/-1;background:#080a09;color:#fff;border:2.5px solid #20df7f;border-radius:14px;padding:9px;font-size:15px;font-weight:700}
      .detail{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .detail>div,.detail>section{border:1px solid #34373d;border-radius:12px;padding:10px}
      .detail section{grid-column:1/-1;border-color:#20df7f}
      .detail p,.detail a{grid-column:1/-1}
      .detail a{text-align:center;border:2px solid #34373d;border-radius:14px;padding:13px;color:#fff;text-decoration:none}
      .droppedTop25{width:max-content;max-width:100%;margin:8px 0 12px;border:1px solid #4b4f55;border-radius:10px;background:#0d0f10}
      .droppedTop25 summary{list-style:none;cursor:pointer;padding:7px 10px;color:#fff;font-weight:800;font-size:11px}
      .droppedTop25 summary::-webkit-details-marker{display:none}
      .droppedList{display:flex;flex-wrap:wrap;gap:7px;padding:0 12px 12px;max-width:680px}
      .droppedList span{border:1px solid #34373d;border-radius:999px;padding:4px 7px;color:#c9cbd0;font-size:10px}
      .viewFull{width:100%;background:#0d0f10;color:#fff;border:2px solid #34373d;border-radius:14px;padding:14px}
      .empty{padding:30px;text-align:center;color:#a9acb3}
      @media(max-width:600px){
        .rankCard{grid-template-columns:32px 68px 1fr 48px;gap:6px;padding:11px 9px;border-left-width:10px}
        .rankPhoto img,.rankPhoto>div{width:64px;height:64px}
        .rankBody strong{font-size:16px}
        .rankBody span,.rankBody b{font-size:12px}
        .rankGi strong{font-size:17px}
        .marketMetrics{grid-template-columns:repeat(4,minmax(84px,1fr));overflow-x:auto}
        .detail{grid-template-columns:repeat(2,1fr)}
      }
    `}</style>
  </main>;
}
