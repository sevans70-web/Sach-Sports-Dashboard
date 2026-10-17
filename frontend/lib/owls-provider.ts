import {providerFetch} from "@/lib/provider-fetch";
type Sport="nfl"|"ncaaf"|"nba"|"wnba"|"nhl"|"soccer";
const cache=new Map<Sport,{expires:number;payload?:any;error?:string}>();
const pending=new Map<Sport,Promise<any>>();
/** One short-lived feed snapshot per sport, shared across markets and leagues. */
export async function getOwlsPayload(sport:Sport){
 const hit=cache.get(sport);
 if(hit&&hit.expires>Date.now()){if(hit.error)throw new Error(hit.error);return hit.payload}
 const running=pending.get(sport);if(running)return running;
 const work=(async()=>{
  const key=process.env.OWLS_INSIGHT_API_KEY?.trim();
  if(!key)throw new Error("OWLS_INSIGHT_API_KEY is missing from Railway.");
  const response=await providerFetch(`https://api.owlsinsight.com/api/v1/${sport}/props`,{headers:{Authorization:`Bearer ${key}`,"x-api-key":key,Accept:"application/json"},cache:"no-store"});
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
