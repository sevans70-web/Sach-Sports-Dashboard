"use client";
import {currentDashboardSnapshot,requireDashboardSummary,scheduleSnapshot} from '@/lib/dashboard-response-state';
import {visiblePolling} from '@/lib/visible-polling';
import {useEffect,useState} from "react";
import {dashboardDay,type DashboardSport} from "@/lib/dashboard-contract";
const cached=new Map<string,{at:number,data:any}>(),pending=new Map<string,Promise<any>>();
const storageKey=(key:string)=>"sach:summary:v3:"+key;
export function peekDashboardSummary(sport:DashboardSport,league="eng.1",scope="current"){
 const day=scope==="today"?dashboardDay(new Date()):"";
 const key=`${sport}|${league}|${scope}|${dashboardDay(new Date())}`;
 const hit=cached.get(key);
 if(currentDashboardSnapshot(hit)&&(!day||hit!.data?.slateDay===day))return hit!.data;
 if(typeof window==="undefined")return null;
 try {
  const raw=window.sessionStorage.getItem(storageKey(key));
  if(!raw)return null;
  const stored=JSON.parse(raw);
  if(!currentDashboardSnapshot(stored)||day&&stored.data?.slateDay!==day)return null;
  cached.set(key,stored);return stored.data;
 }catch{return null}
}

export function fetchDashboardSummary(sport:DashboardSport,league="eng.1",scope="current"){
 const day=scope==="today"?dashboardDay(new Date()):"";
 const key=`${sport}|${league}|${scope}|${dashboardDay(new Date())}`;
 peekDashboardSummary(sport,league,scope);
 const hit=cached.get(key);
 if(hit&&Date.now()-hit.at<30_000&&(!day||hit.data.slateDay===day))return Promise.resolve(hit.data);
 const current=pending.get(key);if(current)return current;
 const work=fetch(`/api/dashboard-summary?sport=${sport}&league=${encodeURIComponent(league)}&scope=${encodeURIComponent(scope)}`,{cache:"no-store",signal:AbortSignal.timeout(20000)}).then(async r=>{if(!r.ok)throw Error(`Dashboard unavailable (${r.status})`);return r.json()}).then(requireDashboardSummary).then(data=>{if(data?.success!==false&&data?.scheduleAvailable!==false){const entry={at:Date.now(),data};cached.set(key,entry);try{window.sessionStorage.setItem(storageKey(key),JSON.stringify(entry))}catch{}}return data}).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
export function useDashboardSummary(sport:DashboardSport,league="eng.1"){
 const key=`${sport}|${league}`;
 const [state,setState]=useState<{key:string,data:any,error:string;at:number}>(()=>({key,data:peekDashboardSummary(sport,league,"current"),error:"",at:Date.now()}));
 useEffect(()=>{let live=true,running=false;const run=async()=>{if(running)return;running=true;try{const data=await fetchDashboardSummary(sport,league);if(live)setState({key,data,error:"",at:Date.now()})}catch(e){if(live)setState(s=>({...s,key,data:s.key===key&&currentDashboardSnapshot(s)?s.data:null,error:"Live updates are temporarily unavailable. Retrying shortly…"}))}finally{running=false}};run();const stopPolling=visiblePolling(run,30_000);return()=>{live=false;stopPolling()}},[sport,league,key]);
 return state.key===key?state:{key,data:peekDashboardSummary(sport,league,"current"),error:"",at:Date.now()};
}
export function useDashboardSchedule(sport:DashboardSport,league="eng.1"){
 const key=`${sport}|${league}`,[state,setState]=useState<ReturnType<typeof scheduleSnapshot>>(null);
 useEffect(()=>{let live=true,running=false;const run=async()=>{if(running)return;running=true;try{const response=await fetch(`/api/game-slate?sport=${sport}&league=${encodeURIComponent(league)}`,{cache:"no-store",signal:AbortSignal.timeout(20000)});const data=await response.json();if(live)setState(previous=>scheduleSnapshot(previous,key,data,response.ok));
 }catch{if(live)setState(previous=>scheduleSnapshot(previous,key,null,false));}finally{running=false}};run();const stopPolling=visiblePolling(run,30_000);return()=>{live=false;stopPolling()}},[sport,league,key]);
 return state?.key===key?state.data:null;
}
