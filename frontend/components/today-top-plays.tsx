"use client";
import {visiblePolling} from '@/lib/visible-polling';
import {savedQuoteQuery} from '@/lib/saved-quote-evidence';
import {reportedFeaturedOriginal} from '@/lib/featured-history-corrections';
import {estimatedEvText,estimatedEvNotice} from '@/lib/estimated-ev';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {featuredScorer,todayTopPlays} from '@/lib/top-plays';
import {dashboardDay} from '@/lib/dashboard-contract';
import type {DashboardSport} from '@/lib/dashboard-contract';
import styles from './today-top-plays.module.css';

export function TodayTopPlays({sport}:{sport:DashboardSport;rows?:any[];loading?:boolean}){
 const [failed,setFailed]=useState(false);
 const [live,setLive]=useState<{sport:string;plays:ReturnType<typeof todayTopPlays>;slateDay?:string}|null>(null);
 useEffect(()=>{let active=true,running=false;const refresh=async()=>{if(running)return;running=true;try{const r=await fetch(`/api/top-plays?sport=${sport}`,{cache:'no-store',signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('Saved picks unavailable');const p=await r.json();if(!Array.isArray(p.plays))throw Error('Saved picks unavailable');if(active){setLive({sport,plays:p.plays,slateDay:p.slateDay});setFailed(false);}}catch{if(active)setFailed(true);/* Retain the last successful choices during a failed refresh. */}finally{running=false}};refresh();const stopPolling=visiblePolling(refresh,30000);return()=>{active=false;stopPolling()}},[sport]);
 // Ranking summaries can arrive before protected originals and contain
 // different players or newer prices. Wait for the saved slate choices.
 const confirmed=live?.sport===sport;
 const featured=confirmed?live.plays:todayTopPlays([],sport);
 const today=dashboardDay(new Date());
 const slateDay=confirmed?live.slateDay||today:today;
 const nextSlate=slateDay>today;
 const slateLabel=nextSlate?new Intl.DateTimeFormat('en-US',{
  timeZone:'America/Toronto',weekday:'short',month:'short',day:'numeric',
 }).format(new Date(slateDay+'T12:00:00Z')):null;
 const scorer=featuredScorer(sport);

 return <section className={styles.section} aria-labelledby={`featured-picks-${sport}`}>
  <header className={styles.header}>
   <h2 id={`featured-picks-${sport}`}>Today’s Featured Picks</h2>
   {slateLabel&&<span>Next slate · {slateLabel}</span>}
  </header>
  <div className={styles.grid}>
   {featured.map(({key,title,pick})=>{
    const correction=reportedFeaturedOriginal(sport,slateDay,key);
    const row=pick?.row;
    const team=row?.teamName||row?.team||row?.teamAbbr||row?.teamAbbreviation;
    const market=row?.market===scorer?.market?scorer?.label:String(row?.market||'').replaceAll('_',' ');
    const selection=row?.lineType==='scorer'?market:`${row?.prediction} ${row?.sportsbookLine} · ${market}`;
    return <article className={styles.card} key={key}>
     <h3>{title}</h3>
     {correction?<><strong>{correction.playerName}</strong><p>Reported original · Anytime touchdown</p><p>Official final: {correction.officialTouchdowns} touchdown</p><p>{correction.note}</p><Link href={`/${sport}/player/${correction.playerId}?market=${correction.market}`}>View Intelligence ›</Link></>:row&&pick?<>
      <div className={styles.player}><strong>{row.playerName}</strong>{team&&<span>{String(team)}</span>}</div>
      <p>{selection}</p>
      <p>{row.sportsbook} {pick.price>0?'+':''}{pick.price}{(row.featuredRetained||row.boardFrozen)&&' · Saved pregame'}</p>
      {pick.basis==='bookmaker_implied'?<p>Book odds · No model EV</p>:<p title={estimatedEvNotice(row)}>EV {estimatedEvText(row)}</p>}
      <Link href={`/${sport}/player/${encodeURIComponent(row.playerId)}?name=${encodeURIComponent(row.playerName)}&team=${encodeURIComponent(row.teamName||row.team||'')}&market=${encodeURIComponent(row.market)}${savedQuoteQuery(row)}`}>View Intelligence ›</Link>
     </>:<p className={styles.status}>{!confirmed?(failed?'Saved picks temporarily unavailable':'Checking saved plays…'):'No Qualified Pick'}</p>}
    </article>;
   })}
  </div>
 </section>;
}
