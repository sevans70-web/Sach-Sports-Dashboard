/** Request-local admission, accounting and cancellation. Foreground fetches pass through. */
import {AsyncLocalStorage} from 'node:async_hooks';
import {gzipSync,gunzipSync} from 'node:zlib';
const context=new AsyncLocalStorage();
const nativeKey=Symbol.for('sach.dashboard-job.fetch.v1');
export const JOB_CONCURRENCY=4;
const REQUEST_RESERVATION=3; // provider check, HTTP, and a possible durable Retry-After update
export class JobDeferred extends Error{constructor(code,retryAt=Date.now()+30000){super(code);this.retryAt=retryAt;this.deferred=true;}}
const official=new Set(['api-web.nhle.com','api.nhle.com','site.api.espn.com','site.web.api.espn.com']);
export function cacheTtl(url){const u=new URL(url);if(!official.has(u.hostname))return 0;
 if(/\/gamecenter\/|\/score\//.test(u.pathname))return 0;
 if(u.pathname==='/apis/search/v2')return 60000;
 if(u.hostname==='site.api.espn.com'&&/^\/apis\/site\/v2\/sports\/basketball\/nba\/teams\/\d+\/schedule$/.test(u.pathname)&&/^\d{4}$/.test(u.searchParams.get('season')||'')&&u.searchParams.get('seasontype')==='2')return 15*60000;
 return /\/roster|\/game-log\/|\/gamelog|\/statistics|\/stats\/|\/standings\/|\/summary$/.test(u.pathname)?15*60000:0;}
export function retryTime(value,now=Date.now()){const n=Number(value),date=Date.parse(value||'');return Math.max(now+60000,value!=null&&String(value).trim()!==''&&Number.isFinite(n)&&n>=0?now+n*1000:Number.isFinite(date)?date:0);}
function active(scope){if(scope.closed||scope.abort.signal.aborted)throw scope.abort.signal.reason||new JobDeferred('job_phase_closed');}
function pause(scope,code,at){scope.paused??=new JobDeferred(code,at);for(const wait of scope.waiters.splice(0)){wait.clean();scope.queueCancelled++;wait.reject(scope.paused);}return scope.paused;}
function cancel(scope,error){const paused=pause(scope,error.message,error.retryAt);if(paused.message===error.message){if(error.details&&!paused.details)paused.details=error.details;if(error.blocked===true)paused.blocked=true;}if(!scope.abort.signal.aborted)scope.abort.abort(error);}
function charge(scope,kind,n=1,ticket){
 active(scope);
 if(ticket){if(ticket.remaining<n)throw Error('job_request_reservation_exhausted');ticket.remaining-=n;scope.reserved-=n;}
 else{if(scope.paused)throw scope.paused;if(scope.used+scope.reserved+n>scope.limit)throw pause(scope,'job_subrequest_budget',scope.now()+1000);}
 scope.used+=n;scope.costs[kind]=(scope.costs[kind]||0)+n;
}
function checkSignal(signal){if(signal.aborted)throw signal.reason||new JobDeferred('job_source_cancelled');}
/** End the caller's wait and detach its continuation even if an RPC cannot accept a signal. */
function abortable(promise,signal){
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{const stop=()=>{clean();reject(signal.reason);},clean=()=>signal.removeEventListener('abort',stop);signal.addEventListener('abort',stop,{once:true});Promise.resolve(promise).then(v=>{clean();if(signal.aborted){void v?.body?.cancel?.().catch(()=>{});return;}resolve(v);},e=>{clean();reject(e);});});
}
function admit(scope){
 active(scope);if(scope.paused)throw scope.paused;
 // Reserve BEFORE any provider RPC. Do not cancel requests already admitted:
 // their completed bodies must reach SQLite before the phase can retry.
 if(scope.used+scope.reserved+REQUEST_RESERVATION>scope.limit)throw pause(scope,'job_subrequest_budget',scope.now()+1000);
 let settle;const ticket={remaining:REQUEST_RESERVATION,done:new Promise(r=>settle=r),settle,released:false};
 scope.reserved+=REQUEST_RESERVATION;scope.active.add(ticket);scope.maxActive=Math.max(scope.maxActive,scope.active.size);scope.maxReserved=Math.max(scope.maxReserved,scope.reserved);scope.admitted++;return ticket;
}
function acquire(scope,signal){
 active(scope);checkSignal(signal);if(scope.paused)return Promise.reject(scope.paused);
 if(scope.active.size<scope.concurrency){try{return Promise.resolve(admit(scope));}catch(e){return Promise.reject(e);}}
 return new Promise((resolve,reject)=>{const wait={resolve,reject,clean:()=>signal.removeEventListener('abort',stop)},stop=()=>{const i=scope.waiters.indexOf(wait);if(i>=0)scope.waiters.splice(i,1);wait.clean();scope.queueCancelled++;reject(signal.reason);};signal.addEventListener('abort',stop,{once:true});scope.waiters.push(wait);});
}
function release(scope,ticket){
 if(ticket.released)return;ticket.released=true;scope.reserved-=ticket.remaining;ticket.remaining=0;scope.active.delete(ticket);ticket.settle();
 while(scope.waiters.length&&scope.active.size<scope.concurrency&&!scope.paused&&!scope.closed&&!scope.abort.signal.aborted){const wait=scope.waiters.shift();wait.clean();try{wait.resolve(admit(scope));}catch(e){wait.reject(e);break;}}
}
export function budgetBinding(binding,scope,kind='kv'){
 if(!binding)return binding;
 return new Proxy(binding,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;return (...args)=>{charge(scope,kind,Array.isArray(args[0])?Math.max(1,args[0].length):1);return value.apply(target,args);};}});
}
export function installJobFetch(){
 globalThis.__sachDashboardJobContext=()=>{const scope=context.getStore();return scope?{id:scope.id,assertActive:()=>{active(scope);if(scope.paused)throw scope.paused;},readInput:key=>scope.store.cacheRead(key),
  readNbaEvidence:scope.allowNbaSourceDenials&&scope.store.readNbaEvidence?key=>{active(scope);return scope.store.readNbaEvidence(key);}:undefined,
  writeNbaEvidence:scope.allowNbaSourceDenials&&scope.cacheSources&&scope.store.writeNbaEvidence?value=>{active(scope);if(scope.paused)throw scope.paused;const stored=scope.store.writeNbaEvidence(value);if(stored){scope.cacheWrites++;scope.checkpointBytes+=JSON.stringify(value).length;}return stored;}:undefined,
  checkpointInput:(key,value,progress)=>{active(scope);if(scope.store.cacheWrite(key,value)===false)throw new JobDeferred('job_source_checkpoint_unavailable');if(progress){scope.cacheWrites++;scope.checkpointBytes+=JSON.stringify(value).length;}}}:undefined;};
 if(globalThis.fetch===globalThis[nativeKey])return;
 const native=globalThis.fetch.bind(globalThis);
 const wrapped=(input,init)=>{const scope=context.getStore();return scope?jobFetch(scope,native,input,init):native(input,init);};
 globalThis[nativeKey]=wrapped;globalThis.fetch=wrapped;
}
function optionalHistoryDenialKey(url,scope){const u=new URL(url);if(!['site.web.api.espn.com','site.api.espn.com'].includes(u.hostname))return null;
 // These callers already handle unavailable optional season baselines and
 // individual summaries/team calendars. A refusal must not poison the whole job before
 // validated history can be read. Preserve the exact denied URL and status;
 // scoreboards, other sports and origin-wide rate limits remain unchanged.
 if(scope.allowNbaSourceDenials&&(
  u.hostname==='site.web.api.espn.com'&&u.pathname==='/apis/common/v3/sports/basketball/nba/statistics/byathlete'||
  u.hostname==='site.api.espn.com'&&u.pathname==='/apis/site/v2/sports/basketball/nba/summary'&&/^\d+$/.test(u.searchParams.get('event')||'')||
  u.hostname==='site.api.espn.com'&&/^\/apis\/site\/v2\/sports\/basketball\/nba\/teams\/\d+\/schedule$/.test(u.pathname)&&/^\d{4}$/.test(u.searchParams.get('season')||'')&&u.searchParams.get('seasontype')==='2'&&[...u.searchParams.keys()].length===2
 ))return 'denied:'+u.href;
 const optional=scope.allowNflSourceDenials&&u.pathname.includes('/football/nfl/')||scope.allowNbaSourceDenials&&u.pathname.includes('/basketball/nba/');const path=optional&&/^\/apis\/common\/v3\/sports\/(?:football\/nfl|basketball\/nba)\/athletes\/\d+\/gamelog$/.test(u.pathname)?u.pathname.replace(/athletes\/\d+/,'athletes/:id'):scope.allowNflSourceDenials&&u.pathname==='/apis/search/v2'&&u.searchParams.get('sport')==='football'?'/apis/search/v2':null;// NBA 403 evidence is specific to an athlete/season, never all athletes.
 return path?'denied:'+u.origin+(u.pathname.includes('/basketball/nba/')?u.pathname+u.search:path):null;}
function cachedResponse(scope,c){scope.cacheHits++;const h=new Headers(c.headers);h.set('x-sach-observed-at',new Date(c.observed).toISOString());return new Response(c.body,{status:c.status,headers:h});}
async function readBody(response,signal,limit){
 if(!response.body)return '';
 const reader=response.body.getReader(),parts=[];let size=0;
 try{for(;;){const {done,value}=await abortable(reader.read(),signal);if(done)break;size+=value.length;if(size>limit)throw Error('job_source_too_large');parts.push(value);}}
 catch(e){void reader.cancel(e).catch(()=>{});throw e;}
 finally{try{reader.releaseLock();}catch{}}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);
}
function headersForBody(response){const h=new Headers(response.headers);h.delete('content-encoding');h.delete('content-length');return h;}
function responseFor(body,response){return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,headers:headersForBody(response)});}
async function jobFetch(scope,native,input,init={}){
 const url=input instanceof Request?input.url:String(input),u=new URL(url),method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
 const redirectMode=init.redirect||(input instanceof Request?input.redirect:'follow');
 const source=method==='GET'&&!headers.has('Authorization')&&!headers.has('x-api-key')&&!headers.has('cookie')&&!headers.has('range')&&!/key|token|auth/i.test(u.search)&&cacheTtl(url)>0&&scope.cacheSources;
 const caller=init.signal||(input instanceof Request?input.signal:undefined),queuedSignal=AbortSignal.any([scope.abort.signal,...(caller?[caller]:[])]);
 active(scope);checkSignal(queuedSignal);if(scope.paused)throw scope.paused;
 if(source){const saved=scope.store.cacheRead(url);if(saved&&saved.expires>scope.now()&&saved.status>=200&&saved.status<300)return cachedResponse(scope,saved);}
 const deniedKey=source&&(scope.allowNflSourceDenials||scope.allowNbaSourceDenials)?optionalHistoryDenialKey(url,scope):null;
 if(deniedKey){const denial=scope.store.cacheRead(deniedKey);if(denial&&denial.expires>scope.now()){scope.denialHits++;return cachedResponse(scope,denial);}}
 if(source){const c=scope.store.cacheRead(url);if(c&&c.expires>scope.now())return cachedResponse(scope,c);const other=scope.sources.get(url);if(other){scope.coalesced++;return (await abortable(other,queuedSignal)).clone();}}
 const work=(async()=>{
  const ticket=await acquire(scope,queuedSignal);let timer,finished=false,streamOwned=false;
  const requestAbort=new AbortController(),signal=AbortSignal.any([queuedSignal,requestAbort.signal]);
  const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);release(scope,ticket);};
  timer=setTimeout(()=>requestAbort.abort(new JobDeferred('job_source_timeout',scope.now()+30000)),scope.requestTimeoutMs);
  try{
   // A denied optional source is not retried by already-queued players.
   if(deniedKey){const d=scope.store.cacheRead(deniedKey);if(d&&d.expires>scope.now()){scope.denialHits++;finish();return cachedResponse(scope,d);}}
   // Another queued request may have completed the same source meanwhile.
   if(source){const c=scope.store.cacheRead(url);if(c&&c.expires>scope.now()){finish();return cachedResponse(scope,c);}}
   let current=url,response;
   for(let redirects=0;;redirects++){
    active(scope);checkSignal(signal);if(scope.paused&&scope.paused.message!=='job_subrequest_budget')throw scope.paused;
    // Redirects need a fresh reservation in the same slot; each hop is metered.
    if(ticket.remaining<REQUEST_RESERVATION){const extra=REQUEST_RESERVATION-ticket.remaining;if(scope.paused||scope.used+scope.reserved+extra>scope.limit)throw pause(scope,'job_subrequest_budget',scope.now()+1000);ticket.remaining+=extra;scope.reserved+=extra;scope.maxReserved=Math.max(scope.maxReserved,scope.reserved);}
    charge(scope,'provider_gate',1,ticket);const gate=await abortable(scope.gate(new URL(current).origin),signal);active(scope);checkSignal(signal);
    if(gate>scope.now())throw pause(scope,'provider_cooldown',gate);
    if(scope.paused&&scope.paused.message!=='job_subrequest_budget')throw scope.paused;
    charge(scope,official.has(new URL(current).hostname)?'official_http':new URL(current).hostname.endsWith('.supabase.co')?'history_http':'odds_or_other_http',1,ticket);
    response=await abortable(native(input instanceof Request&&current===url?new Request(input,{...init,method,headers,signal,redirect:'manual'}):current,{...init,method,headers,signal,redirect:'manual'}),signal);
    active(scope);checkSignal(signal);
    if(response.status===429){const until=retryTime(response.headers.get('Retry-After'),scope.now());await response.body?.cancel();charge(scope,'provider_gate',1,ticket);await abortable(scope.gate(new URL(current).origin,until),signal);throw pause(scope,'provider_http_429',until);}
    if([301,302,303,307,308].includes(response.status)){
     if(redirectMode==='manual')break;
     const location=response.headers.get('Location');await response.body?.cancel();if(redirectMode==='error'||!source||!location||redirects>=3)throw Error('job_source_redirect_rejected');const next=new URL(location,current);if(!official.has(next.hostname)||next.username||next.password)throw Error('job_source_redirect_rejected');current=next.href;continue;
    }
    break;
   }
   // Public sources are bounded and fully drained inside their admission slot.
   // A successful header alone is never a checkpoint.
   if(official.has(u.hostname)||!response.ok){
    const body=await readBody(response,signal,response.ok?8*1024*1024:1024*1024);active(scope);checkSignal(signal);scope.completed++;
    if(source&&(response.ok||[404,410].includes(response.status))){
     if(response.ok)JSON.parse(body);
     const at=scope.now(),h=headersForBody(response);h.set('x-sach-observed-at',new Date(at).toISOString());
     const value={body,status:response.status,headers:[...h],observed:at,expires:at+(response.ok?cacheTtl(url):60000)};
     if(scope.store.cacheWrite(url,value)===false)throw new JobDeferred('job_source_checkpoint_unavailable');scope.cacheWrites++;scope.checkpointBytes+=body.length;
     return responseFor(body,{status:response.status,headers:h});
    }
    if(deniedKey&&response.status===403){const at=scope.now(),expires=Math.max(at+3600000,retryTime(response.headers.get('Retry-After'),at));const endpoint=deniedKey.slice(7);const value={status:403,body:JSON.stringify({error:'official_source_access_denied',endpoint,retryAt:new Date(expires).toISOString()}),headers:[['Content-Type','application/json'],['x-sach-source-state','recorded_access_denial']],observed:at,expires};if(scope.store.cacheWrite(deniedKey,value)===false)throw new JobDeferred('job_source_checkpoint_unavailable');scope.sourceDenials.push({endpoint,status:403,retryAt:expires});return responseFor(value.body,{status:403,headers:value.headers});}
    if(source&&[401,403,408,500,502,503,504].includes(response.status)){
     const failure=pause(scope,'job_source_http_'+response.status,retryTime(response.headers.get('Retry-After'),scope.now()));
     failure.details??={stage:'source',endpoint:u.origin+u.pathname,status:response.status};
     throw failure;
    }
    return responseFor(body,response);
   }
   if(!response.body){scope.completed++;return response;}
   // Private/large database responses remain streaming. Keep their slot and
   // cancellation signal until the caller consumes or cancels the entire body.
   const reader=response.body.getReader();let controller,ended=false;
   const end=()=>{if(ended)return;ended=true;signal.removeEventListener('abort',stop);scope.readers.delete(stop);try{reader.releaseLock();}catch{}finish();};
   const stop=()=>{void reader.cancel(signal.reason).catch(()=>{});controller?.error(signal.reason);end();};
   const stream=new ReadableStream({start(c){controller=c;},async pull(c){try{const chunk=await abortable(reader.read(),signal);if(ended)return;if(chunk.done){scope.completed++;c.close();end();}else c.enqueue(chunk.value);}catch(e){if(!ended){c.error(e);end();}}},async cancel(reason){await reader.cancel(reason);end();}});
   signal.addEventListener('abort',stop,{once:true});scope.readers.add(stop);streamOwned=true;
   // end() uses finish; leave the active ticket owned by this stream.
   return new Response(stream,{status:response.status,headers:response.headers});
  }catch(e){if(signal.aborted&&!scope.abort.signal.aborted){scope.aborted++;throw pause(scope,e instanceof JobDeferred?e.message:'job_source_timeout',scope.now()+30000);}throw e;}
  finally{if(!streamOwned)finish();}
 })();
 scope.inflight.add(work);if(source)scope.sources.set(url,work);
 try{const result=await work;return source?result.clone():result;}finally{scope.inflight.delete(work);if(source&&scope.sources.get(url)===work)scope.sources.delete(url);}
}
function usage(scope){return {used:scope.used,limit:scope.limit,costs:scope.costs,cacheHits:scope.cacheHits,cacheWrites:scope.cacheWrites,checkpointBytes:scope.checkpointBytes,completedRequests:scope.completed,maxActive:scope.maxActive,maxReserved:scope.maxReserved,coalesced:scope.coalesced,queuedCancelled:scope.queueCancelled,aborted:scope.aborted,sourceDenials:scope.sourceDenials,denialHits:scope.denialHits};}
async function drain(scope,deadline){while(scope.active.size)await Promise.race([Promise.allSettled([...scope.active].map(t=>t.done)),deadline]);}
export async function runJobBudget({env,store,gate,limit=220,deadlineMs=25000,requestTimeoutMs=10000,concurrency=JOB_CONCURRENCY,cacheSources=false,allowNflSourceDenials=false,allowNbaSourceDenials=false,now=()=>Date.now()},operation,withEnvironment=(_env,f)=>f()){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>JOB_CONCURRENCY||limit<REQUEST_RESERVATION)throw Error('invalid_job_limits');
 installJobFetch();const scope={id:crypto.randomUUID(),store,gate,limit,concurrency,cacheSources,allowNflSourceDenials,allowNbaSourceDenials,sourceDenials:[],denialHits:0,now,requestTimeoutMs,used:0,reserved:0,costs:{},cacheHits:0,cacheWrites:0,checkpointBytes:0,completed:0,admitted:0,maxActive:0,maxReserved:0,coalesced:0,queueCancelled:0,aborted:0,active:new Set(),waiters:[],readers:new Set(),sources:new Map(),inflight:new Set(),abort:new AbortController(),paused:null,closed:false};
 const scopedEnv={...env,VINEXT_KV_CACHE:budgetBinding(env.VINEXT_KV_CACHE,scope)};
 let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new JobDeferred('job_wall_deadline');cancel(scope,e);reject(e);},deadlineMs);});
 try{
  const result=await context.run(scope,()=>withEnvironment(scopedEnv,()=>Promise.race([operation(scopedEnv,scope),deadline])));
  if(scope.paused)throw scope.paused;
  if(scope.inflight.size||scope.active.size){pause(scope,'source_warmup_retry',scope.now()+1000);await drain(scope,deadline);throw scope.paused;}
  return {result,usage:usage(scope)};
 }catch(e){
  if(!scope.paused)cancel(scope,e);
  try{await drain(scope,deadline);}catch(timeout){e=timeout;}
  const error=scope.abort.signal.aborted&&scope.abort.signal.reason?.message==='job_wall_deadline'?scope.abort.signal.reason:scope.paused||e;error.usage=usage(scope);throw error;
 }finally{clearTimeout(timer);scope.closed=true;cancel(scope,new JobDeferred('job_phase_closed'));}
}
export function encode(value){return gzipSync(JSON.stringify(value)).toString('base64');}
export function decode(value){return JSON.parse(gunzipSync(Buffer.from(value,'base64')).toString('utf8'));}
