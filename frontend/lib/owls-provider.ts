import {providerFetch} from "@/lib/provider-fetch";
type Sport="nfl"|"ncaaf"|"nba"|"wnba"|"nhl"|"soccer"|"cbb";
const cache=new Map<Sport,{expires:number;payload?:any;error?:string}>();
const pending=new Map<Sport,Promise<any>>();
const sourceCache=new Map<string,{expires:number;payload?:any;error?:string}>();
const sourcePending=new Map<string,Promise<any>>();
export async function getOwlsArchiveCoverage(){
 const tag='archive-coverage',hit=sourceCache.get(tag);if(hit&&hit.expires>Date.now()){if(hit.error)throw Error(hit.error);return hit.payload}
 const running=sourcePending.get(tag);if(running)return running;
 const work=(async()=>{
  const key=process.env.OWLS_INSIGHT_API_KEY?.trim();if(!key)throw Error('Book feed is not configured');
  const response=await providerFetch('https://api.owlsinsight.com/api/v1/history/coverage',{headers:{Authorization:`Bearer ${key}`,'x-api-key':key,Accept:'application/json'},cache:'no-store'});
  if(!response.ok){const error=`Archive coverage returned ${response.status}`;sourceCache.set(tag,{expires:Date.now()+300_000,error});throw Error(error)}
  const payload=await response.json();sourceCache.set(tag,{expires:Date.now()+300_000,payload});return payload;
 })();sourcePending.set(tag,work);try{return await work}finally{sourcePending.delete(tag)}
}
/** Bet365 moved its raw player markets off the merged v1 feed. Keep its
 * transport separate: raw buckets are not verified normalized quotes. */
export async function getOwlsBet365Payload(sport:'nfl'|'nba'){
 const hit=sourceCache.get(sport);if(hit&&hit.expires>Date.now()){if(hit.error)throw Error(hit.error);return hit.payload}
 const running=sourcePending.get(sport);if(running)return running;
 const work=(async()=>{
  const key=process.env.OWLS_INSIGHT_API_KEY?.trim();if(!key)throw Error('Book feed is not configured');
  const response=await providerFetch(`https://api.owlsinsight.com/api/v2/bet365/${sport}`,{headers:{Authorization:`Bearer ${key}`,'x-api-key':key,Accept:'application/json'},cache:'no-store'});
  if(!response.ok){const error=`Bet365 source returned ${response.status}`;sourceCache.set(sport,{expires:Date.now()+60_000,error});throw Error(error)}
  const payload=await response.json();sourceCache.set(sport,{expires:Date.now()+60_000,payload});return payload;
 })();sourcePending.set(sport,work);try{return await work}finally{sourcePending.delete(sport)}
}
/** One short-lived feed snapshot per sport, shared across markets and leagues. */
export async function getOwlsPayload(sport:Sport){
 const hit=cache.get(sport);
 if(hit&&hit.expires>Date.now()){if(hit.error)throw new Error(hit.error);return hit.payload}
 const running=pending.get(sport);if(running)return running;
 const work=(async()=>{
  const key=process.env.OWLS_INSIGHT_API_KEY?.trim();
  if(!key)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");
  const providerSport=sport==="cbb"?"ncaab":sport;
  const response=await providerFetch(`https://api.owlsinsight.com/api/v1/${providerSport}/props`,{headers:{Authorization:`Bearer ${key}`,"x-api-key":key,Accept:"application/json"},cache:"no-store"});
  if(!response.ok){
   const error=`Owls Insight returned ${response.status}`;
   const retry=Number(response.headers.get("retry-after"));
   const delay=response.status===429&&Number.isFinite(retry)&&retry>0?Math.min(retry*1000,3600000):30_000;
   // Never reuse stale book lines after an authorization or billing failure.
   cache.set(sport,{expires:Date.now()+delay,error});throw new Error(error);
  }
  const payload=await response.json();cache.set(sport,{expires:Date.now()+60_000,payload});return payload;
 })();
 pending.set(sport,work);
 try{return await work}finally{pending.delete(sport)}
}
