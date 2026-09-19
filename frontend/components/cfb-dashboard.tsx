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


function Card({row,market,live}:{row:Row;market:CfbMarketKey;live:LiveResponse}){
  const[open,setOpen]=useState(false);
  const proj=projectionText(row,market);
  const lg=liveFor(row,live);
  const actual=lg?.actual??null;
  const confidence=row.modelProbability!=null?`${Number(row.modelProbability).toFixed(0)}%`:"—";
  const progress=row.modelProjection!=null&&actual!=null&&Number(row.modelProjection)>0
    ?Math.max(0,Math.min(100,(Number(actual)/Number(row.modelProjection))*100))
    :0;

  return <article className={`rankCard ${lg?.state==="in"?"isLive":""}`}>
    <details className="droppedTop25"><summary>👁 Dropped from Top 25 ({dropped.length})</summary><div className="droppedList">{dropped.map((x:any)=><span key={String(x.playerId||x.playerName)}>{x.playerName}{x.teamName?` (${x.teamName})`:""}</span>)}</div></details>:null}

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
      .droppedTop25{width:max-content;max-width:100%;margin:10px 0 14px;border:1.5px solid #4a4e55;border-radius:12px;background:#0d0f10}
      .droppedTop25 summary{list-style:none;cursor:pointer;padding:9px 13px;color:#fff;font-weight:800;font-size:14px}
      .droppedTop25 summary::-webkit-details-marker{display:none}
      .droppedList{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 11px;max-width:650px}
      .droppedList span{border:1px solid #34373d;border-radius:999px;padding:5px 8px;color:#c9cbd0;font-size:11px}

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
      .projectionLine{color:#fff!important;font-weight:800}.projectionLine b{color:#d9b85d}.confidenceLine{color:#fff!important}.confidenceLine b{color:#20df7f}
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
