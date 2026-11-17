import {boundedWork} from '@/lib/bounded-work';
import {PUBLIC_PROVIDER_USER_AGENT} from '@/lib/provider-fetch';
/** Public official evidence only. Never retry a denied endpoint on another host. */
import {dashboardJobContext} from '@/lib/dashboard-job-context';
const entries=new Map<string,{at:number;expires:number;status:number;body:string;bytes:number}>();
const denied=new Map<string,number>(),limited=new Map<string,number>();let bytes=0;
function retryAt(header:string|null,now:number,minimum:number){const seconds=header==null?NaN:Number(header),date=header==null?NaN:Date.parse(header);return Math.max(now+minimum,Number.isFinite(seconds)?now+Math.max(0,seconds)*1000:Number.isFinite(date)?date:0);}
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
 // An NBA athlete's denial does not establish denial of another athlete or
 // season. Keep the diagnostic family, but suppress only the rejected URL.
 // Origin-wide 429 cooldowns and the existing NFL denial policy are unchanged.
 const job=dashboardJobContext();job?.assertActive();const now=Date.now(),source=new URL(url),origin=source.origin,family=officialHistoryFamily(url),denialKey=family&&source.pathname.includes('/basketball/nba/')?source.href:family,until=denialKey?denied.get(denialKey)||0:0;
 // Live scoreboards have their own short, schema-validated NBA cache. Never
 // freeze their changing statuses in this 15-minute historical-input cache.
 const cacheable=!source.pathname.endsWith('/scoreboard');
 for(const [key,expires] of denied)if(expires<=now)denied.delete(key);
 if(!job){for(const [k,v] of entries)if(v.expires<=now){entries.delete(k);bytes-=v.bytes;}const hit=cacheable?entries.get(url):null;if(hit)return new Response(hit.body,{status:hit.status,headers:{'Content-Type':'application/json','x-sach-observed-at':new Date(hit.at).toISOString()}});}
 const cooldown=limited.get(origin)||0;if(!job&&cooldown>now)return Response.json({error:'provider_cooldown',retryAt:new Date(cooldown).toISOString()},{status:429,headers:{'Retry-After':String(Math.ceil((cooldown-now)/1000))}});
 if(!job&&until>now)return Response.json({error:'official_source_access_denied',retryAt:new Date(until).toISOString()},{status:403,headers:{'x-sach-source-state':'recorded_access_denial'}});
 // workerd accepts follow/manual, but rejects redirect:error before sending
 // anything upstream. Keep the no-redirect policy explicitly, including when
 // the background budget wrapper meters this request.
 const deadline=AbortSignal.timeout(8000),signal=init.signal?AbortSignal.any([init.signal,deadline]):deadline;
 // Preserve the existing NBA public integration's identity on the initial
 // request. Never change profiles or retry another host after an access denial.
 const userAgent=source.pathname.includes('/sports/basketball/nba/')?PUBLIC_PROVIDER_USER_AGENT:'SachSports/1.0';
 const response=await globalThis.fetch(url,{...init,...(source.pathname.includes('/sports/basketball/nba/')?{cache:'no-store' as RequestCache}:{}),headers:{Accept:'application/json','User-Agent':userAgent},signal,redirect:'manual'});
 if([301,302,303,307,308].includes(response.status)){
  await response.body?.cancel();
  throw Error('official_source_redirect_rejected');
 }
 if(response.status===429&&!job)limited.set(origin,retryAt(response.headers.get('Retry-After'),now,60000));
 if(response.status===403&&family){if(!job)denied.set(denialKey!,retryAt(response.headers.get('Retry-After'),now,3600000));console.warn('[official source unavailable]',JSON.stringify({endpoint:family,status:403,retryAt:new Date(retryAt(response.headers.get('Retry-After'),now,3600000)).toISOString()}));return response;}
 if(!job&&cacheable&&response.ok){const body=await response.text();JSON.parse(body);const size=body.length*2;if(size<=512*1024){const prior=entries.get(url);if(prior){entries.delete(url);bytes-=prior.bytes;}while(entries.size&&(entries.size>=128||bytes+size>8*1024*1024)){const key=entries.keys().next().value!;bytes-=entries.get(key)!.bytes;entries.delete(key);}entries.set(url,{at:now,expires:now+15*60000,status:response.status,body,bytes:size});bytes+=size;}return new Response(body,{status:response.status,headers:{'Content-Type':'application/json'}});}
 return response;
}
