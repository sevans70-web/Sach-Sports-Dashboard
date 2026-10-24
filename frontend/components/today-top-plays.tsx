"use client";
import Link from 'next/link';
import {todayTopPlays} from '@/lib/top-plays';
import type {DashboardSport} from '@/lib/dashboard-contract';
import styles from './today-top-plays.module.css';

export function TodayTopPlays({sport,rows=[],loading=false}:{sport:DashboardSport;rows?:any[];loading?:boolean}){
 return <section className={styles.section} aria-label="Today's Top Plays">
  <h2>Today’s Top Plays</h2>
  <div className={styles.carousel} tabIndex={0} aria-label="Swipe featured categories">
   {todayTopPlays(rows,sport).map(({key,title,pick})=><article className={styles.card} key={key}>
    <h3>{title}</h3>
    {pick?<><strong>{pick.row.playerName}</strong><p>{pick.row.prediction} {pick.row.lineType==='scorer'?'':pick.row.sportsbookLine} · {String(pick.row.market).replaceAll('_',' ')}</p><p>{pick.row.sportsbook} · {pick.price>0?'+':''}{pick.price}</p><p>Model probability: {pick.probability.toFixed(1)}%</p><Link href={`/${sport}/player/${encodeURIComponent(pick.row.playerId)}?market=${encodeURIComponent(pick.row.market)}`}>View Intelligence ›</Link></>:<><strong>{loading?'Checking today’s plays…':'No Qualified Pick'}</strong><p>{key==='first'?'No qualifying first-basket selection is available.':'No selection currently meets the criteria.'}</p></>}
   </article>)}
  </div>
 </section>;
}
