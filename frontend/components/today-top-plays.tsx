"use client";
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {todayTopPlays} from '@/lib/top-plays';
import type {DashboardSport} from '@/lib/dashboard-contract';
import styles from './today-top-plays.module.css';

export function TodayTopPlays({sport,rows=[],loading=false}:{sport:DashboardSport;rows?:any[];loading?:boolean}){
 const [live,setLive]=useState<{sport:string;plays:ReturnType<typeof todayTopPlays>}|null>(null);
 useEffect(()=>{let active=true,running=false;const refresh=async()=>{if(running)return;running=true;try{const r=await fetch(`/api/top-plays?sport=${sport}`,{cache:'no-store'});if(!r.ok){if(active)setLive(null);return;}const p=await r.json();if(active)setLive(p.state==='ready'&&Array.isArray(p.plays)?{sport,plays:p.plays}:null);}catch{if(active)setLive(null)}finally{running=false}};refresh();const id=setInterval(refresh,30000);return()=>{active=false;clearInterval(id)}},[sport]);
 const featured=live?.sport===sport?live.plays:todayTopPlays(rows,sport);
 return <section className={styles.section} aria-label="Today's Top Plays">
  <h2>Today’s Top Plays</h2>
  <div className={styles.carousel} tabIndex={0} aria-label="Swipe featured categories">
   {featured.map(({key,title,pick})=><article className={styles.card} key={key}>
    <h3>{title}</h3>
    {pick?<><strong>{pick.row.playerName}</strong><p>{pick.row.prediction} {pick.row.lineType==='scorer'?'':pick.row.sportsbookLine} · {String(pick.row.market).replaceAll('_',' ')}</p><p>{pick.row.sportsbook} · {pick.price>0?'+':''}{pick.price}</p><p>Model probability: {pick.probability.toFixed(1)}%</p><Link href={`/${sport}/player/${encodeURIComponent(pick.row.playerId)}?market=${encodeURIComponent(pick.row.market)}`}>View Intelligence ›</Link></>:<><strong>{loading&&live?.sport!==sport?'Checking today’s plays…':'No Qualified Pick'}</strong><p>{key==='first'?'No qualifying first-basket selection is available.':'No selection currently meets the criteria.'}</p></>}
   </article>)}
  </div>
 </section>;
}
