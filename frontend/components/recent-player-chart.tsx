"use client";
import {useEffect,useState} from "react";
import {playerChartSlots,type PlayerChartGame,type PlayerHistoryPoint} from "@/lib/player-card-history";
import styles from "./recent-player-chart.module.css";

export function RecentChart({
  points,
  statLabel,
  line,
  projection,
  liveValue,
  games=[],
  span,
  rookie=false,
  headToHead=false,
}: {
  points:PlayerHistoryPoint[];
  statLabel:string;
  line: number | null;
  projection: number | null;
  liveValue?: number | null;
  games?: PlayerChartGame[];
  span:number;
  rookie?:boolean;
  headToHead?:boolean;
}) {
  const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>setSelected(null),[points.length,games.length,span,liveValue]);
  const slots=playerChartSlots(points,games,span);
  const plotted=liveValue==null?slots:[...slots,{date:'',gameId:'',opponent:'',value:liveValue}];
  const max=Math.max(1,...plotted.map(slot=>slot.value??0),headToHead?0:line||0,projection||0);
  const min=headToHead?Math.min(0,...plotted.map(slot=>slot.value??0)):0;
  const range=max-min;
  const baseline=100*(-min/range);
  const recorded=slots.filter(slot=>slot.value!=null);
  const average=recorded.length?Number((recorded.reduce((sum,slot)=>sum+slot.value!,0)/recorded.length).toFixed(1)):null;
  const chosen=selected==null?null:plotted[selected];
  const dateLabel=(date:string,year=false)=>new Date(date).toLocaleDateString("en-US",{
    timeZone:/^\d{4}-\d{2}-\d{2}$/.test(date)?"UTC":"America/Toronto",
    month:"short",day:"numeric",...(year?{year:"numeric"}:{}),
  });
  const label=(slot:typeof slots[number],index:number)=>slot.date?
   dateLabel(slot.date,headToHead)+(slot.opponent?" · "+slot.opponent:""):
   index===span&&liveValue!=null?"Live":`Slot ${index+1}`;
  return (
    <><div className={styles.chart}>
      <div className={styles.chartBars}>
        {plotted.map((slot,index)=>{
          const isLive=index===span&&liveValue!=null;
          const detail=slot.value==null?(slot.gameId?'No recorded stat':'No game data'):`${slot.value} ${statLabel}`;
          return <button type="button" className={styles.barSlot} key={slot.gameId||index} onClick={()=>setSelected(index)}
            aria-pressed={selected===index} aria-label={`${label(slot,index)}: ${detail}`}>
            {headToHead && slot.value != null ? <div className={styles.meetingPlot}>
              {min < 0 && <i className={styles.zeroAxis} style={{bottom:`${baseline}%`}} />}
              <i className={`${styles.bar} ${styles.meetingBar}`} style={{
                height: slot.value === 0 ? "2px" : `${Math.abs(slot.value)/range*100}%`,
                bottom: `${baseline+Math.min(0,slot.value)/range*100}%`,
              }} />
            </div> : slot.value!=null&&<i className={`${styles.bar} ${isLive?styles.liveBar:''}`} style={{height:`${Math.max(0,(slot.value/max)*100)}%`}}/>}
            <span className={headToHead ? styles.meetingDate : undefined}>{isLive?"Live":headToHead&&slot.date?dateLabel(slot.date):`G${index+1}`}</span>
          </button>;
        })}

      </div>

      {projection != null ? (
        <div
          className={styles.projectionMarker}
          style={{ bottom: `${Math.min(96, Math.max(4, (projection / max) * 100))}%` }}
        >
          <span>{Number(projection.toFixed(1))}</span>
        </div>
      ) : null}
    </div>
    <p className={styles.chartReadout}>{headToHead
      ? `${recorded.length} ${recorded.length===1?"meeting":"meetings"} · ${average} ${statLabel} per game${line==null?"":` · Line ${line}`}`
      : `${recorded.length} of ${span} games with recorded stats${average==null?'':` · ${average} average`}${recorded.length<span&&rookie?' · Rookie season':''}`}</p>
    <p className={styles.chartReadout} role="status">{chosen&&selected!=null?`${label(chosen,selected)}: ${chosen.value==null?(chosen.gameId?'No recorded stat for this game':'No game data available'):`${chosen.value} ${statLabel}`}`:recorded.length<span?'Blank slots have no recorded stat.':'Tap a bar for the exact game result.'}</p></>
  );
}
