"use client";
import {useEffect,useState} from "react";
import type {PlayerHistoryPoint} from "@/lib/player-card-history";
import styles from "./recent-player-chart.module.css";

export function RecentChart({
  values,
  points,
  statLabel,
  line,
  projection,
  liveValue,
}: {
  values: number[];
  points:PlayerHistoryPoint[];
  statLabel:string;
  line: number | null;
  projection: number | null;
  liveValue?: number | null;
}) {
  const [selected,setSelected]=useState<number|null>(null);
  useEffect(()=>setSelected(null),[values.length,liveValue]);
  const plotted = liveValue == null ? values : [...values, liveValue];
  if (!plotted.length) {
    return (
      <div className={styles.chartEmpty}>
        Recent game-by-game values are not available from this feed yet.
      </div>
    );
  }

  const max = Math.max(
    1,
    ...plotted,
    line || 0,
    projection || 0
  );

  return (
    <><div className={styles.chart}>
      <div className={styles.chartBars}>
        {plotted.map((value, index) => (
          <button type="button" className={styles.barSlot} key={`${value}-${index}`} onClick={()=>setSelected(index)} aria-pressed={selected===index} aria-label={`${points[index]?.date||`Game ${index+1}`} ${points[index]?.opponent||""}: ${value} ${statLabel}`}>
            <i
              className={`${styles.bar} ${index === plotted.length - 1 && liveValue != null ? styles.liveBar : ""}`}
              style={{ height: `${Math.max(0, (value / max) * 100)}%` }}
            />
            <span>{index === plotted.length - 1 && liveValue != null ? "Live" : `G${index + 1}`}</span>
          </button>
        ))}
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
    <p className={styles.chartReadout} role="status">{selected==null?"Tap a bar for the exact game result.":`${points[selected]?.date?new Date(points[selected].date!).toLocaleDateString("en-US",{timeZone:/^\d{4}-\d{2}-\d{2}$/.test(points[selected].date!)?"UTC":"America/Toronto",month:"short",day:"numeric"}):selected===values.length?"Live":"Game "+(selected+1)}${points[selected]?.opponent?" · "+points[selected].opponent:""}: ${plotted[selected]} ${statLabel}`}</p></>
  );
}
