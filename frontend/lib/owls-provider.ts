import {providerFetch} from "@/lib/provider-fetch";
type Sport="nfl"|"ncaaf"|"nba"|"wnba"|"nhl"|"soccer"|"cbb";
const cache=new Map<Sport,{expires:number;payload?:any;error?:string}>();
const pending=new Map<Sport,Promise<any>>();
const sourceCache=new Map<string,{expires:number;payload?:any;error?:string}>();
const sourcePending=new Map<string,Promise<any>>();
/** Included graded-results capability, NOT the restricted MVP history archive.
 * Two fixed dates, at most two reads per sport/hour, no caller-controlled query.
 * A provider grade is discovery evidence only, never model-validation evidence. */
export async function getOwlsIncludedResultsSample(sport:'nfl'|'nba'){
 const tag='included-results-'+sport,hit=sourceCache.get(tag);
 if(hit&&hit.expires>Date.now()){if(hit.error)throw Error(hit.error);return hit.payload}
 const running=sourcePending.get(tag);if(running)return running;
 const work=(async()=>{
  const key=process.env.OWLS_INSIGHT_API_KEY?.trim();if(!key)throw Error('Book feed is not configured');
  const read=async(query:Record<string,string>)=>{
   const response=await providerFetch(`https://api.owlsinsight.com/api/v1/${sport}/props/results?`+new URLSearchParams(query),{headers:{Authorization:`Bearer ${key}`,'x-api-key':key,Accept:'application/json'},cache:'no-store'});
   if(!response.ok){const error=`Included prop results returned ${response.status}`;const retry=Number(response.headers.get('retry-after'));sourceCache.set(tag,{expires:Date.now()+Math.max(3600_000,Number.isFinite(retry)?Math.min(86400_000,retry*1000):0),error});throw Error(error)}
   return response.json();
  };
  const date=sport==='nba'?'2026-04-01':'2026-10-18';
  const discovery=await read({date});
  const games=Array.isArray(discovery?.data)?discovery.data:discovery?.data?.games??discovery?.games;
  const first=Array.isArray(games)?games[0]:null;
  const id=first?.eventId??first?.event_id??first?.gameId??first?.game_id;
  // Provider event IDs can contain full team names, including spaces. They
  // remain query values, never paths/URLs; forbid control characters and bound size.
  const gameId=typeof id==='string'&&id.startsWith(sport+':')&&id.length<=200&&!/[\x00-\x1f\x7f]/.test(id)?id:null;
  const response=gameId?await read({game_id:gameId,confirmed_only:'true',category:sport==='nba'?'points':'passing_yards'}):null;
  const payload={date,gameId,discovery,response};sourceCache.set(tag,{expires:Date.now()+3600_000,payload});return payload;
 })();sourcePending.set(tag,work);try{return await work}finally{sourcePending.delete(tag)}
}
/** Two fixed, bounded archive probes for model-data coverage. No caller-supplied
 * URL, date range, pagination or credentials. Successful samples cache for an
 * hour; errors respect Retry-After with a minimum five-minute cooldown. */
export async function getOwlsArchiveValidationSample(sport:'nfl'|'nba'){
 const tag='validation-sample-'+sport,hit=sourceCache.get(tag);if(hit&&hit.expires>Date.now()){if(hit.error)throw Error(hit.error);return hit.payload}
 const running=sourcePending.get(tag);if(running)return running;
 const work=(async()=>{
  const key=process.env.OWLS_INSIGHT_API_KEY?.trim();if(!key)throw Error('Book feed is not configured');
  const query=sport==='nba'?{sport,propType:'points',startDate:'2026-04-01',endDate:'2026-04-07',isMain:'true',limit:'100'}:{sport,propType:'passing_yards',startDate:'2026-10-01',endDate:'2026-10-07',isMain:'true',limit:'100'};
  const response=await providerFetch('https://api.owlsinsight.com/api/v1/history/player-props?'+new URLSearchParams(query),{headers:{Authorization:`Bearer ${key}`,'x-api-key':key,Accept:'application/json'},cache:'no-store'});
  if(!response.ok){const error=`Archive validation sample returned ${response.status}`;const retry=Number(response.headers.get('retry-after'));sourceCache.set(tag,{expires:Date.now()+Math.max(300_000,Math.min(3600_000,Number.isFinite(retry)?retry*1000:0)),error});throw Error(error)}
  const payload={query,response:await response.json()};sourceCache.set(tag,{expires:Date.now()+3600_000,payload});return payload;
 })();sourcePending.set(tag,work);try{return await work}finally{sourcePending.delete(tag)}
}
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
