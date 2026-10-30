"use client";
import {savedQuoteQuery} from '@/lib/saved-quote-evidence';
import {reportedFeaturedOriginal} from '@/lib/featured-history-corrections';
import {estimatedEvText,estimatedEvNotice} from '@/lib/estimated-ev';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {todayTopPlays} from '@/lib/top-plays';
import {dashboardDay} from '@/lib/dashboard-contract';
import type {DashboardSport} from '@/lib/dashboard-contract';
import styles from './today-top-plays.module.css';

export function TodayTopPlays({sport}:{sport:DashboardSport;rows?:any[];loading?:boolean}){
 const [failed,setFailed]=useState(false);
 const [live,setLive]=useState<{sport:string;plays:ReturnType<typeof todayTopPlays>;slateDay?:string}|null>(null);
 useEffect(()=>{let active=true,running=false;const refresh=async()=>{if(running)return;running=true;try{const r=await fetch(`/api/top-plays?sport=${sport}`,{cache:'no-store',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Saved picks unavailable');const p=await r.json();if(!Array.isArray(p.plays))throw Error('Saved picks unavailable');if(active){setLive({sport,plays:p.plays,slateDay:p.slateDay});setFailed(false);}}catch{if(active)setFailed(true);/* Retain the last successful choices during a failed refresh. */}finally{running=false}};refresh();const id=setInterval(refresh,30000);return()=>{active=false;clearInterval(id)}},[sport]);
 // Ranking summaries can arrive before protected originals and contain
 // different players or newer prices. Wait for the saved slate choices.
 const confirmed=live?.sport===sport;
 const featured=confirmed?live.plays:todayTopPlays([],sport);
 return <section className={styles.section} aria-label="Today's Top Plays">
  <h2>{live?.sport===sport&&live.slateDay&&live.slateDay!==dashboardDay(new Date())?'Next Slate’s Featured Picks':'Today’s Featured Picks'}</h2>
  <div className={styles.carousel} tabIndex={0} aria-label="Swipe featured categories">
   {featured.map(({key,title,pick})=>{const correction=reportedFeaturedOriginal(sport,live?.sport===sport?live.slateDay||dashboardDay(new Date()):dashboardDay(new Date()),key);return <article className={styles.card} key={key}>
    <h3>{title}</h3>
    {correction?<><strong>{correction.playerName}</strong><p>Reported original · Anytime touchdown</p><p>Official final: {correction.officialTouchdowns} touchdown</p><p>{correction.note}</p><Link href={`/${sport}/player/${correction.playerId}?market=${correction.market}`}>View Intelligence ›</Link></>:pick?<><strong>{pick.row.playerName}</strong>{pick.row.featuredRetained&&<p>Saved pregame selection · {Date.parse(pick.row.gameTime)<=Date.now()?'Game started':'Today'}</p>}<p>{pick.row.prediction} {pick.row.lineType==='scorer'?'':pick.row.sportsbookLine} · {String(pick.row.market).replaceAll('_',' ')}</p><p>{pick.row.boardFrozen?'Saved pregame · ':''}{pick.row.sportsbook} · {pick.price>0?'+':''}{pick.price}</p><details><summary>Probability details</summary><p>{pick.basis==='bookmaker_implied'?'Book-implied chance':'Model probability'}: {pick.probability.toFixed(1)}%</p></details><p title={estimatedEvNotice(pick.row)}>EV: {estimatedEvText(pick.row)}</p><Link href={`/${sport}/player/${encodeURIComponent(pick.row.playerId)}?name=${encodeURIComponent(pick.row.playerName)}&team=${encodeURIComponent(pick.row.teamName||pick.row.team||'')}&market=${encodeURIComponent(pick.row.market)}${savedQuoteQuery(pick.row)}`}>View Intelligence ›</Link></>:<><strong>{!confirmed?(failed?'Saved picks temporarily unavailable':'Checking saved plays…'):'No Qualified Pick'}</strong><p>{!confirmed?'Loading original selections and saved pregame prices.':key==='first'?'No qualifying first-basket selection is available.':'No selection currently meets the criteria.'}</p></>}
   </article>})}
  </div>
 </section>;
}

