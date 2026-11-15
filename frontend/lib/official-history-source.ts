import {boundedWork} from '@/lib/bounded-work';
/** Public official evidence only. Never retry a denied endpoint on another host. */
import {dashboardJobContext} from '@/lib/dashboard-job-context';
const entries=new Map<string,{at:number;expires:number;status:number;body:string;bytes:number}>();
const denied=new Map<string,number>();let bytes=0;
export function officialHistoryFamily(url:string){const u=new URL(url);if(!['site.web.api.espn.com','site.api.espn.com'].includes(u.hostname))return null;
 if(/^\/apis\/common\/v3\/sports\/(?:football\/nfl|basketball\/nba)\/athletes\/\d+\/gamelog$/.test(u.pathname))return u.origin+u.pathname.replace(/athletes\/\d+/, 'athletes/:id');
 if(u.pathname==='/apis/search/v2'&&u.searchParams.get('sport')==='football')return u.origin+'/apis/search/v2?sport=football';return null;}
const foreground=boundedWork(4,256,15000),nbaForeground=boundedWork(4,256,15000);
export async function nbaOfficialFetch(url:string,init:RequestInit={}){return dashboardJobContext()?read(url,init):nbaForeground.run(()=>read(url,init));}
export async function nflOfficialFetch(url:string,init:RequestInit={}){
 if(dashboardJobContext())return read(url,init);
 return foreground.run(()=>read(url,init));
}
async function read(url:string,init:RequestInit={}){
 const job=dashboardJobContext();job?.assertActive();const now=Date.now(),family=officialHistoryFamily(url),until=family?denied.get(family)||0:0;
 if(!job){for(const [k,v] of entries)if(v.expires<=now){entries.delete(k);bytes-=v.bytes;}const hit=entries.get(url);if(hit)return new Response(hit.body,{status:hit.status,headers:{'Content-Type':'application/json','x-sach-observed-at':new Date(hit.at).toISOString()}});}
 if(!job&&until>now)return Response.json({error:'official_source_access_denied',retryAt:new Date(until).toISOString()},{status:403,headers:{'x-sach-source-state':'recorded_access_denial'}});
 const response=await globalThis.fetch(url,{...init,headers:{Accept:'application/json','User-Agent':'SachSports/1.0'},signal:init.signal||AbortSignal.timeout(8000),redirect:'error'});
 if(response.status===403&&family){if(!job)denied.set(family,now+3600000);console.warn('[official source unavailable]',JSON.stringify({endpoint:family,status:403,retryAfterMs:3600000}));return response;}
 if(!job&&response.ok){const body=await response.text();JSON.parse(body);const size=body.length*2;if(size<=512*1024){const prior=entries.get(url);if(prior){entries.delete(url);bytes-=prior.bytes;}while(entries.size&&(entries.size>=128||bytes+size>8*1024*1024)){const key=entries.keys().next().value!;bytes-=entries.get(key)!.bytes;entries.delete(key);}entries.set(url,{at:now,expires:now+15*60000,status:response.status,body,bytes:size});bytes+=size;}return new Response(body,{status:response.status,headers:{'Content-Type':'application/json'}});}
 return response;
}
