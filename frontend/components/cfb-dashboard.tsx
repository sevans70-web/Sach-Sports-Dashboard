"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
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

function prediction(row:Row){
  if(row.sportsbookLine==null||row.modelProjection==null)return null;
  const line=Number(row.sportsbookLine);
  const projection=Number(row.modelProjection);
  if(!Number.isFinite(line)||!Number.isFinite(projection))return null;
  const side=projection>=line?"OVER":"UNDER";
  const edge=projection-line;
  return {side,edge,line};
}

function grade(row:Row,market:CfbMarketKey,actual:number|null,completed:boolean){
  if(!completed||actual==null||row.sportsbookLine==null)return null;
  if(market==="anytime_td"||market==="first_td")return actual>0?"hit":"miss";

  const line=Number(row.sportsbookLine);
  if(actual===line)return "push";

  const projection=row.modelProjection==null?null:Number(row.modelProjection);
  const pick=projection!=null&&projection<line?"under":"over";
  return pick==="under"?(actual<line?"hit":"miss"):(actual>line?"hit":"miss");
}

function Card({row,market,live}:{row:Row;market:CfbMarketKey;live:LiveResponse}){
  const[open,setOpen]=useState(false);
  const m=meta(market);
  const proj=projectionText(row,market);
  const lg=liveFor(row,live);
  const actual=lg?.actual??null;
  const finalGrade=grade(row,market,actual,Boolean(lg?.completed));
  const pick=prediction(row);
  const progress=row.sportsbookLine!=null&&actual!=null&&Number(row.sportsbookLine)>0
    ?Math.max(0,Math.min(100,(Number(actual)/Number(row.sportsbookLine))*100))
    :0;

  return <article className={`rankCard ${lg?.state==="in"?"isLive":""}`}>
    <div className="rankNo">
      #{row.rank}
      <span className={row.movement==="NEW"?"new":Number(row.movement||0)>0?"up":Number(row.movement||0)<0?"down":""}>
        {move(row.movement)}
      </span>
    </div>

    <div className="rankPhoto">
      {row.headshot?<img src={row.headshot} alt=""/>:<div>CFB</div>}
    </div>

    <div className="rankBody">
      <strong>{row.playerName}</strong>
      <span>{row.teamName}{row.position?` · ${row.position}`:""}</span>
      {row.matchup?<span>{row.matchup}</span>:null}
      {row.gameTime?<span className="gameTime">🗓️ {gameTime(row.gameTime)}</span>:null}

      <b>{row.sportsbookLine!=null?`${m[2]} line: ${row.sportsbookLine}`:`${m[2]} statistical intelligence`}</b>

      {lg?.state==="in"?
        <div className="livePanel">
          <div className="liveHeader">● LIVE · {quarterLabel(lg.quarter)}{lg.clock?` · ${lg.clock}`:""}</div>
          <div className="liveCurrent">Current: <b>{actual??"—"} {unit(market)}</b> / Line <b>{row.sportsbookLine??"—"}</b></div>
          <div className="progressTrack"><div className="progressFill" style={{width:`${progress}%`}}/></div>
        </div>:null}

      {lg?.completed?
        <div className={`finalPanel ${finalGrade||""}`}>
          <div className="finalHeader">
            FINAL {finalGrade==="hit"?"✅":finalGrade==="miss"?"❌":finalGrade==="push"?"➖":""}
          </div>
          <div>Final: <b>{actual??"—"} {unit(market)}</b> / Frozen line <b>{row.sportsbookLine??"—"}</b></div>
        </div>:null}

      <p className="projectionLine"><b>Sach Projection:</b> {proj}</p>

      {pick?
        <p className={`predictionLine ${pick.side==="OVER"?"over":"under"}`}>
          <b>Prediction:</b> {pick.side} {pick.line} <span>· Edge {pick.edge>=0?"+":""}{pick.edge.toFixed(1)}</span>
        </p>:null}

      <p>{row.modelProbability!=null?`${pick?.side||"Model"} probability ${Number(row.modelProbability).toFixed(0)}%`:"Model probability: —"}</p>

      {row.frozen?<span className="locked">LOCKED AT KICKOFF</span>:null}
    </div>

    <div className="rankGi">
      <span>GI SCORE</span>
      <strong>{Number(row.giScore||0).toFixed(1)}</strong>
    </div>

    <button className="intelButton" onClick={()=>setOpen(v=>!v)}>
      {open?"ⓘ Hide Intelligence":"ⓘ View Intelligence"}
    </button>

    {open?<div className="detail">
      <div><span>MODEL</span><b>{row.modelProbability!=null?`${Number(row.modelProbability).toFixed(1)}%`:"—"}</b></div>
      <div><span>SPORTSBOOK LINE</span><b>{row.sportsbookLine??"—"}</b></div>
      <div><span>BOOKS</span><b>{row.bookmakerCount||0}</b></div>
      <div><span>POSITION</span><b>{row.position||"—"}</b></div>
      <section>
        <span>MODEL PROJECTION</span>
        <strong>{proj}</strong>
        {row.projectionGames?<small>Recent sample: {row.projectionGames} games</small>:null}
      </section>
      <p>{row.summary}</p>
      <Link href={`/cfb/player/${encodeURIComponent(row.playerId)}?market=${encodeURIComponent(market)}&name=${encodeURIComponent(row.playerName)}&team=${encodeURIComponent(row.teamName)}&matchup=${encodeURIComponent(row.matchup)}&gi=${row.giScore}&prob=${row.modelProbability??""}&line=${row.sportsbookLine??""}&projection=${encodeURIComponent(String(row.modelProjection??""))}&img=${encodeURIComponent(row.headshot||"")}&position=${encodeURIComponent(row.position||"")}&teamId=${encodeURIComponent(row.teamId||"")}`}>
        Open full player card
      </Link>
    </div>:null}
  </article>;
}

export default function CfbDashboard(){
  const[group,setGroup]=useState<"QB"|"Offense">("QB");
  const[market,setMarket]=useState<CfbMarketKey>("passing_yards");
  const[period,setPeriod]=useState("Today");
  const[full,setFull]=useState(false);

  const s=useJson<ScheduleResponse>("/api/cfb/schedule",{success:false,games:[],qualifiedCount:0},30000);
  const r=useJson<RankingResponse>(`/api/cfb/rankings?market=${market}`,{success:false,rows:[]},120000);
  const live=useJson<LiveResponse>(`/api/cfb/live?market=${market}`,{success:false,games:[]},15000);
  const overall=useJson<CfbPerformanceResponse>(`/api/cfb/performance?period=${period}&group=${group}`,{success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null},60000);
  const perf=useJson<CfbPerformanceResponse>(`/api/cfb/performance?period=${period}&group=${group}&market=${market}`,{success:false,connected:false,hits:0,settled:0,pending:0,hitRate:null},60000);

  const rows=useMemo(()=>r.data.rows||[],[r.data]);
  const markets=group==="QB"?QB_MARKETS:OFFENSE_MARKETS;
  const active=meta(market);

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

    <section className="section">
      <h2>📊 Prediction Performance</h2>

      <div className="tabs">
        <button className={group==="QB"?"active":""} onClick={()=>setGroup("QB")}>🏈 QB</button>
        <button className={group==="Offense"?"active":""} onClick={()=>setGroup("Offense")}>🏃 Offense</button>
      </div>

      <h3>🌐 Overall CFB {group} Performance</h3>

      <div className="tabs periods">
        {["Today","Yesterday","Week","Month","Season"].map(x=>
          <button className={period===x?"active":""} onClick={()=>setPeriod(x)} key={x}>{x}</button>
        )}
      </div>

      <div className="metrics">
        <article><span>Hit Rate</span><strong>{overall.data.hitRate==null?"—":`${overall.data.hitRate}%`}</strong></article>
        <article><span>Correct / Settled</span><strong>{overall.data.hits} / {overall.data.settled}</strong></article>
        <article><span>All {group} Pending Today</span><strong>{overall.data.pending}</strong></article>
      </div>

      <div className="tabs">
        {markets.map(k=>{
          const m=meta(k);
          return <button className={market===k?"active":""} onClick={()=>setMarket(k)} key={k}>{m[1]} {m[2]}</button>;
        })}
      </div>

      <div className="metrics four">
        <article><span>Hits / Saved Today</span><strong>{perf.data.hits} / {perf.data.total||0}</strong></article>
        <article><span>Pending</span><strong>{perf.data.pending}</strong></article>
        <article><span>Settled</span><strong>{perf.data.settled}</strong></article>
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

      <div className="tabs">
        {markets.map(k=>{
          const m=meta(k);
          return <button className={market===k?"active":""} onClick={()=>setMarket(k)} key={k}>{m[1]} {m[2]}</button>;
        })}
      </div>

      <h2>{active[1]} {active[2]} Rankings</h2>

      {r.data.dropped?.length?
        <div className="dropped"><b>Dropped from Top 25:</b> {r.data.dropped.map((x:any)=>x.playerName).join(", ")}</div>:null}

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
      .snapshot,.metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
      .metrics.four{grid-template-columns:repeat(4,1fr)}
      .snapshot article,.metrics article{border:2px solid #34373d;border-radius:18px;padding:14px;background:#111214;display:flex;flex-direction:column;gap:8px}
      .section{margin-top:34px}
      .tabs{display:flex;overflow-x:auto;border-bottom:2px solid #34373d}
      .tabs button{flex:0 0 auto;background:transparent;border:0;border-bottom:4px solid transparent;color:#fff;padding:13px 18px;font-weight:800}
      .tabs button.active{border-bottom-color:#f04f5f}
      .rankHeader{background:#0c0d0e;padding:20px;margin-top:8px}
      .rankCard{position:relative;display:grid;grid-template-columns:55px 120px 1fr 86px;gap:12px;border:4px solid #34373d;border-left:16px solid #20df7f;border-radius:26px;background:#111214;padding:20px;margin:20px 0}
      .rankCard.isLive{box-shadow:0 0 0 2px rgba(32,223,127,.35),0 0 20px rgba(32,223,127,.18)}
      .rankNo{font-size:26px;font-weight:900}
      .rankNo span{display:block;margin-top:12px;color:#9da1a8}
      .rankNo .up{color:#20df7f}
      .rankNo .down{color:#ff6b6b}
      .rankNo .new{color:#d9b85d;font-size:13px}
      .rankPhoto img,.rankPhoto>div{width:112px;height:112px;border-radius:50%;border:4px solid #d9b85d;object-fit:cover}
      .rankPhoto>div{display:grid;place-items:center}
      .rankBody strong{font-size:25px}
      .rankBody span{display:block;color:#a9acb3;margin-top:5px}
      .rankBody b{display:block;margin-top:10px}
      .rankBody p{color:#a9acb3}
      .gameTime{color:#d9b85d!important;font-weight:700}
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
      .projectionLine b{color:#d9b85d}
      .predictionLine b{color:#d9b85d}
      .predictionLine.over{color:#20df7f}
      .predictionLine.under{color:#fff}
      .predictionLine span{display:inline!important;color:#a9acb3!important}
      .locked{display:inline-block!important;width:max-content;padding:3px 8px;border:1px solid #20df7f;border-radius:999px;color:#20df7f!important;font-size:11px}
      .rankGi{text-align:right}
      .rankGi strong{display:block;color:#d9b85d;font-size:26px}
      .intelButton{grid-column:2/-1;background:#080a09;color:#fff;border:4px solid #20df7f;border-radius:18px;padding:14px;font-size:19px;font-weight:700}
      .detail{grid-column:1/-1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
      .detail>div,.detail>section{border:1px solid #34373d;border-radius:12px;padding:10px}
      .detail section{grid-column:1/-1;border-color:#20df7f}
      .detail p,.detail a{grid-column:1/-1}
      .detail a{text-align:center;border:2px solid #34373d;border-radius:14px;padding:13px;color:#fff;text-decoration:none}
      .dropped{margin:14px 0;color:#d6d7da}
      .dropped b{color:#ff6b6b}
      .viewFull{width:100%;background:#0d0f10;color:#fff;border:2px solid #34373d;border-radius:14px;padding:14px}
      .empty{padding:30px;text-align:center;color:#a9acb3}
      @media(max-width:600px){
        .rankCard{grid-template-columns:40px 92px 1fr 70px;gap:9px;padding:14px 10px;border-left-width:12px}
        .rankPhoto img,.rankPhoto>div{width:86px;height:86px}
        .metrics.four{grid-template-columns:repeat(4,minmax(120px,1fr));overflow-x:auto}
        .periods{overflow-x:auto}
        .detail{grid-template-columns:repeat(2,1fr)}
      }
    `}</style>
  </main>;
}
