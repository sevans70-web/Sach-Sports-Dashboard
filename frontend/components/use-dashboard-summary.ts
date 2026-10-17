"use client";
import {useEffect,useState} from "react";
import type {DashboardSport} from "@/lib/dashboard-contract";
const cached=new Map<string,{at:number,data:any}>(),pending=new Map<string,Promise<any>>();
export function fetchDashboardSummary(sport:DashboardSport,league="eng.1"){
 const key=`${sport}|${league}`,hit=cached.get(key);if(hit&&Date.now()-hit.at<30_000)return Promise.resolve(hit.data);
 const current=pending.get(key);if(current)return current;
 const work=fetch(`/api/dashboard-summary?sport=${sport}&league=${encodeURIComponent(league)}`,{cache:"no-store"}).then(async r=>{if(!r.ok)throw Error(`Dashboard unavailable (${r.status})`);return r.json()}).then(data=>{cached.set(key,{at:Date.now(),data});return data}).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
export function useDashboardSummary(sport:DashboardSport,league="eng.1"){
 const key=`${sport}|${league}`;
 const [state,setState]=useState<{key:string,data:any,error:string}>({key,data:cached.get(key)?.data||null,error:""});
 useEffect(()=>{let live=true,running=false;const run=async()=>{if(running)return;running=true;try{const data=await fetchDashboardSummary(sport,league);if(live)setState({key,data,error:""})}catch(e){if(live)setState(s=>({...s,error:e instanceof Error?e.message:"Dashboard unavailable"}))}finally{running=false}};run();const id=setInterval(run,30_000);return()=>{live=false;clearInterval(id)}},[sport,league,key]);
 return state.key===key?state:{key,data:null,error:""};
}
export function useDashboardSchedule(sport:DashboardSport,league="eng.1"){
 const key=`${sport}|${league}`,[state,setState]=useState<{key:string,data:any}>({key,data:null});
 useEffect(()=>{let live=true,running=false;const run=async()=>{if(running)return;running=true;try{const response=await fetch(`/api/game-slate?sport=${sport}&league=${encodeURIComponent(league)}`,{cache:"no-store"});const data=await response.json();if(live)setState({key,data})}catch{}finally{running=false}};run();const id=setInterval(run,30_000);return()=>{live=false;clearInterval(id)}},[sport,league,key]);
 return state.key===key?state.data:null;
}
