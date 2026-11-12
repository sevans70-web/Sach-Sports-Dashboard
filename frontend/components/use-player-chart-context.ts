"use client";
import {useEffect,useState} from 'react';
import type {PlayerChartGame} from '@/lib/player-card-history';

type Context={draftYear:number|null;rookie:boolean;games:PlayerChartGame[]};
export function usePlayerChartContext(sport:string,id:string,team:string,before:string,source='',enabled=true){
 const query=new URLSearchParams({sport,id,team,before,source}).toString();
 const [result,setResult]=useState<{query:string;data:Context}|null>(null);
 useEffect(()=>{
  if(!enabled||!['nba','nfl','nhl','wnba'].includes(sport))return;
  const controller=new AbortController();
  fetch('/api/player-card-context?'+query,{signal:controller.signal}).then(response=>response.ok?response.json():null)
   .then(data=>{if(data&&!controller.signal.aborted)setResult({query,data});}).catch(()=>{});
  return ()=>controller.abort();
 },[enabled,query,sport]);
 return result?.query===query?result.data:null;
}
