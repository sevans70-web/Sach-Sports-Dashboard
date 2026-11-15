import {workerRuntimeSecret} from '@/lib/worker-runtime-secret';
import {providerFetch} from '@/lib/provider-fetch';
import {dashboardJobContext} from '@/lib/dashboard-job-context';
import {boundedValueCache} from '@/lib/bounded-value-cache';
type Sport='nfl'|'nhl';
export type BookFeedDiagnostic={provider:'owls';sport:Sport;endpoint:string;code:string;status:number|null;retryAt:string|null;authorizationPresent:boolean};
export class BookFeedUnavailable extends Error{constructor(public diagnostic:BookFeedDiagnostic){super(diagnostic.code);}}
const cache=boundedValueCache<{payload?:any;diagnostic?:BookFeedDiagnostic;expires:number}>(4*1024*1024,8),pending=new Map<string,Promise<any>>();
function retryAt(value:string|null,status:number,now:number){const minimum=[401,403].includes(status)?1800000:status===429?60000:30000,n=value==null?NaN:Number(value),date=Date.parse(value||'');return Math.max(now+minimum,Number.isFinite(n)?now+Math.max(n,0)*1000:Number.isFinite(date)?date:0);}
const fields=(value:any,keys:string[])=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
/** Persist quote input only, never account metadata, headers or credentials. */
export function bookQuoteSnapshot(payload:any){if(!Array.isArray(payload?.data))throw Error('provider_invalid_schema');return {data:payload.data.map((g:any)=>({...fields(g,['gameId','eventId','id','awayTeam','away_team','homeTeam','home_team','commenceTime','commence_time','startTime','date']),books:(Array.isArray(g.books)?g.books:[]).map((b:any)=>({...fields(b,['key','title','name','lastUpdate']),props:(Array.isArray(b.props)?b.props:[]).map((p:any)=>fields(p,['playerName','player_name','team','teamName','category','market','type','sourceCategory','sourcePeriod','periodID','periodId','period','periodName','lastUpdate','suspended','isSuspended','active','marketStructure','lineType','kind','isAlternate','isMainLine','propId','overPrice','over_price','underPrice','under_price','line','point','total','event_link']))}))}))};}
export function bookFeedDiagnostic(error:unknown,sport:Sport):BookFeedDiagnostic{
 if(error instanceof BookFeedUnavailable)return error.diagnostic;
 const code=error instanceof Error&&/timeout|abort/i.test(error.message)?'request_timeout':error instanceof Error&&/provider_invalid_schema/.test(error.message)?'provider_invalid_schema':'provider_request_failed';
 return {provider:'owls',sport,endpoint:`/api/v1/${sport}/props`,code,status:null,retryAt:null,authorizationPresent:true};
}
export async function getDashboardBookFeed(sport:Sport){
 const job=dashboardJobContext();job?.assertActive();const key='dashboard-book:owls:'+sport+':v1',now=Date.now();
 const saved=job?.readInput?.(key)||(!job?cache.get(key):undefined);
 if(saved&&saved.expires>now){if(saved.diagnostic)throw new BookFeedUnavailable(saved.diagnostic);return saved.payload;}
 const owner=(job?.id||'foreground')+'|'+sport,existing=pending.get(owner);if(existing)return existing;
 const work=(async()=>{
  const credential=workerRuntimeSecret('OWLS_INSIGHT_API_KEY');
  const fail=(code:string,status:number|null,expires:number,authorizationPresent=Boolean(credential))=>{
   const diagnostic:BookFeedDiagnostic={provider:'owls',sport,endpoint:`/api/v1/${sport}/props`,code,status,retryAt:new Date(expires).toISOString(),authorizationPresent};
   const value={diagnostic,expires};if(job)job.checkpointInput?.(key,value,false);else cache.set(key,value,expires-Date.now());throw new BookFeedUnavailable(diagnostic);
  };
  if(!credential)return fail('worker_secret_missing',null,now+1800000,false);
  try{
   const response=await providerFetch('https://api.owlsinsight.com/api/v1/'+sport+'/props',{headers:{Authorization:'Bearer '+credential,'x-api-key':credential,Accept:'application/json'},cache:'no-store'});
   if(!response.ok){const expires=retryAt(response.headers.get('Retry-After'),response.status,Date.now());await response.body?.cancel();return fail('provider_http_'+response.status,response.status,expires);}
   const payload=bookQuoteSnapshot(await response.json()),expires=Date.now()+60000,value={payload,expires};
   if(job)job.checkpointInput?.(key,value,true);else cache.set(key,value,60000);
   return payload;
  }catch(error){if(error instanceof BookFeedUnavailable||(error as any)?.deferred)throw error;const d=bookFeedDiagnostic(error,sport);return fail(d.code,d.status,Date.now()+30000);}
 })();pending.set(owner,work);try{return await work}finally{if(pending.get(owner)===work)pending.delete(owner);}
}
