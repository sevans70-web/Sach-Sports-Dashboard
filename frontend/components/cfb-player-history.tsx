"use client";

import {useEffect,useMemo,useState} from "react";
import type {CfbMarketKey} from "@/lib/cfb";

type HistoryPoint={
  season:number;
  gameId:string;
  date:string;
  opponent:string;
  atVs:string;
  value:number;
};

type HistoryResponse={
  success:boolean;
  supported:boolean;
  points:HistoryPoint[];
  statLabel:string;
  message?:string;
};

function shortDate(value:string){
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return value||"—";
  return new Intl.DateTimeFormat("en-US",{
    timeZone:"America/Toronto",
    month:"2-digit",
    day:"2-digit",
    year:"2-digit",
  }).format(d);
}

export function CfbPlayerHistory({
  playerId,
  playerName,
  market,
  marketLabel,
  line,
}:{
  playerId:string;
  playerName:string;
  market:CfbMarketKey;
  marketLabel:string;
  line:string;
}){
  const[span,setSpan]=useState<5|10|20>(10);
  const[data,setData]=useState<HistoryResponse|null>(null);

  useEffect(()=>{
    let active=true;
    fetch(`/api/cfb/player/${encodeURIComponent(playerId)}/history?market=${encodeURIComponent(market)}`,{cache:"no-store"})
      .then(r=>r.json())
      .then(v=>active&&setData(v))
      .catch(()=>active&&setData({success:false,supported:true,points:[],statLabel:marketLabel,message:"Player history is temporarily unavailable."}));
    return()=>{active=false};
  },[playerId,market,marketLabel]);

  const points=useMemo(()=>((data?.points||[]).slice(-span)),[data,span]);
  const max=Math.max(1,...points.map(x=>Number(x.value)||0));
  const total=points.reduce((a,x)=>a+Number(x.value||0),0);
  const l5=points.slice(-5);
  const l10=points.slice(-10);
  const avg=(xs:HistoryPoint[])=>xs.length?(xs.reduce((a,x)=>a+Number(x.value||0),0)/xs.length).toFixed(1):"—";
  const marketLine=Number(line);
  const hasLine=Number.isFinite(marketLine);
  const hits=hasLine?points.filter(x=>Number(x.value)>marketLine).length:0;

  return <section className="historyBlock">
    <div className="historyTabs">
      {[5,10,20].map(n=><button key={n} type="button" className={span===n?"active":""} onClick={()=>setSpan(n as 5|10|20)}>Last {n}</button>)}
    </div>

    <h2>Last {span} Games · {marketLabel}</h2>

    {!data?<div className="historyEmpty">Loading player history…</div>:
      !data.supported?<div className="historyEmpty">{data.message||"Game-by-game history is not available for this market."}</div>:
      points.length===0?<div className="historyEmpty">{data.message||`No verified game-by-game ${marketLabel.toLowerCase()} history is available for ${playerName}.`}</div>:
      <>
        <div className={`historyChart span${span}`} aria-label={`${marketLabel} history chart`}>
          {points.map((p,i)=>{
            const height=Math.max(5,Math.round((Number(p.value||0)/max)*120));
            return <div className="barCol" key={`${p.season}-${p.gameId}-${i}`}>
              <b>{p.value}</b>
              <div className="barTrack"><div className="bar" style={{height:`${height}px`}}/></div>
              <span>{shortDate(p.date)}</span>
              <small>{p.season}</small>
            </div>;
          })}
        </div>

        <div className="historyStats">
          <article><small>{span}-GAME TOTAL</small><strong>{Number.isInteger(total)?total:total.toFixed(1)}</strong></article>
          <article><small>L5 AVG</small><strong>{avg(l5)}</strong></article>
          <article><small>L10 AVG</small><strong>{avg(l10)}</strong></article>
          <article><small>{hasLine?"OVER LINE":"GAMES"}</small><strong>{hasLine?`${hits}/${points.length}`:points.length}</strong></article>
        </div>

        {points.some(p=>p.season<2026)?<p className="historyNote">Prior-season games are included for returning players until enough current-season history is available.</p>:null}
      </>
    }

    <style jsx>{`
      .historyBlock{margin-top:20px}
      .historyTabs{display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:2px solid #34373d}
      .historyTabs::-webkit-scrollbar{display:none}
      .historyTabs button{flex:1;min-width:100px;background:#111319;color:#fff;border:1px solid #383b42;padding:12px 18px;font-weight:800;cursor:pointer}
      .historyTabs button.active{color:#fff;border-color:#f04f5f;background:#351015}
      h2{font-size:24px;margin:18px 0 12px}
      .historyChart{display:flex;align-items:flex-end;gap:8px;overflow-x:auto;padding:18px 10px 8px;border:1px solid #34373d;border-radius:16px;background:#0d0f10;min-height:190px;scrollbar-width:none}
      .historyChart::-webkit-scrollbar{display:none}
      .barCol{min-width:54px;display:grid;grid-template-rows:22px 124px auto auto;justify-items:center;align-items:end}
      .barCol b{font-size:12px}
      .barTrack{height:124px;display:flex;align-items:flex-end}
      .bar{width:18px;min-height:5px;border-radius:6px 6px 2px 2px;background:#20df7f}
      .barCol span{margin-top:6px;color:#d5d6d9;font-size:10px;white-space:nowrap}
      .barCol small{color:#8f949c;font-size:9px;margin-top:2px}
      .historyStats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}
      .historyStats article{border:1px solid #34373d;border-left:4px solid #20df7f;border-radius:12px;padding:10px;background:#111214}
      .historyStats small{display:block;color:#9da1a8;font-size:10px}
      .historyStats strong{display:block;margin-top:5px;font-size:18px}
      .historyEmpty{border:1px solid #34373d;border-radius:14px;padding:18px;color:#a9acb3;background:#0d0f10}
      .historyNote{color:#9da1a8;line-height:1.4;font-size:13px}
      @media(max-width:600px){.historyStats{grid-template-columns:repeat(2,1fr)}.barCol{min-width:49px}}
    `}</style>
  </section>;
}
