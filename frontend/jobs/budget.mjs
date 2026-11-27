/** Request-local accounting for dashboard jobs. Never changes foreground fetches. */
import {AsyncLocalStorage} from 'node:async_hooks';
import {gzipSync,gunzipSync} from 'node:zlib';
const context=new AsyncLocalStorage();
const nativeKey=Symbol.for('sach.dashboard-job.fetch.v1');
export class JobDeferred extends Error{constructor(code,retryAt=Date.now()+30000){super(code);this.retryAt=retryAt;this.deferred=true;}}
const official=new Set(['api-web.nhle.com','api.nhle.com','site.api.espn.com','site.web.api.espn.com']);
export function cacheTtl(url){const u=new URL(url);if(!official.has(u.hostname))return 0;
 if(/\/gamecenter\/|\/score\//.test(u.pathname))return 0;
 return /\/roster|\/game-log\/|\/gamelog|\/statistics|\/stats\/|\/standings\/|\/summary$/.test(u.pathname)?15*60000:0;}
export function retryTime(value,now=Date.now()){const n=Number(value),date=Date.parse(value||'');return Math.max(now+60000,value!=null&&String(value).trim()!==''&&Number.isFinite(n)&&n>=0?now+n*1000:Number.isFinite(date)?date:0);}
function fail(scope,code,at){scope.paused??=new JobDeferred(code,at);scope.abort.abort(scope.paused);throw scope.paused;}
function charge(scope,kind,n=1){if(scope.closed)throw new JobDeferred('job_phase_closed');if(scope.paused)throw scope.paused;if(scope.used+n>scope.limit)fail(scope,'job_subrequest_budget');scope.used+=n;scope.costs[kind]=(scope.costs[kind]||0)+n;}
export function budgetBinding(binding,scope,kind='kv'){
 if(!binding)return binding;
 return new Proxy(binding,{get(target,key){const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;return (...args)=>{charge(scope,kind,Array.isArray(args[0])?Math.max(1,args[0].length):1);return value.apply(target,args);};}});
}
export function installJobFetch(){
 globalThis.__sachDashboardJobContext=()=>{const scope=context.getStore();return scope?{id:scope.id,acceptance:scope.acceptance,assertActive:()=>{if(scope.paused||scope.closed)charge(scope,'blocked',0);}}:undefined;};
 if(globalThis.fetch===globalThis[nativeKey])return;
 const native=globalThis.fetch.bind(globalThis);
 const wrapped=(input,init)=>{const scope=context.getStore();return scope?jobFetch(scope,native,input,init):native(input,init);};
 globalThis[nativeKey]=wrapped;globalThis.fetch=wrapped;
}
async function jobFetch(scope,native,input,init={}){
 const {sachNotAfter,...requestInit}=init;
 const url=input instanceof Request?input.url:String(input),u=new URL(url),method=String(init.method||(input instanceof Request?input.method:'GET')).toUpperCase();
 const headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined));
 const cacheable=method==='GET'&&!headers.has('Authorization')&&!headers.has('x-api-key')&&!headers.has('cookie')&&!/key|token|auth/i.test(u.search)&&cacheTtl(url)>0&&scope.cacheSources;
 if(scope.paused||scope.closed)charge(scope,'blocked',0);
 if(cacheable){const c=scope.store.cacheRead(url);if(c&&c.expires>scope.now()){scope.cacheHits++;const h=new Headers(c.headers);h.set('x-sach-observed-at',new Date(c.observed).toISOString());return new Response(c.body,{status:c.status,headers:h});}}
 const work=(async()=>{
  let current=url,response;
  for(let redirects=0;;redirects++){
   // Leave one accounted RPC available to persist a last-request 429 cooldown.
   if(scope.used+3>scope.limit)fail(scope,'job_subrequest_budget');
   charge(scope,'provider_gate');const gate=await scope.gate(new URL(current).origin);if(gate>scope.now())fail(scope,'provider_cooldown',gate);
   charge(scope,official.has(new URL(current).hostname)?'official_http':new URL(current).hostname.endsWith('.supabase.co')?'history_http':'odds_or_other_http');
   const signal=AbortSignal.any([scope.abort.signal,...(init.signal?[init.signal]:input instanceof Request?[input.signal]:[])]);
   if(sachNotAfter!==undefined&&Date.now()>=sachNotAfter)throw Error('nba_capture_board_locked');
   response=await native(input instanceof Request&&current===url?new Request(input,{...requestInit,method,headers,signal,redirect:'manual'}):current,{...requestInit,method,headers,signal,redirect:'manual'});
   if(response.status===429){const until=retryTime(response.headers.get('Retry-After'),scope.now());await response.body?.cancel();charge(scope,'provider_gate');await scope.gate(new URL(current).origin,until);fail(scope,'provider_http_429',until);}
   if([301,302,303,307,308].includes(response.status)){
    if(init.redirect==='manual'||input instanceof Request&&input.redirect==='manual')return response;
    const location=response.headers.get('Location');await response.body?.cancel();
    if(!cacheable||!location||redirects>=3)throw Error('job_source_redirect_rejected');
    const next=new URL(location,current);if(!official.has(next.hostname)||next.username||next.password)throw Error('job_source_redirect_rejected');current=next.href;continue;
   }
   break;
  }
  if(!cacheable||!response.ok)return response;
  const reader=response.body.getReader(),parts=[];let size=0;
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024){await reader.cancel();throw Error('job_source_too_large');}parts.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  const body=new TextDecoder().decode(bytes);JSON.parse(body);const at=scope.now();const h=new Headers(response.headers);h.delete('content-encoding');h.delete('content-length');h.set('x-sach-observed-at',new Date(at).toISOString());
  scope.store.cacheWrite(url,{body,status:response.status,headers:[...h],observed:at,expires:at+cacheTtl(url)});return new Response(body,{status:response.status,headers:h});
 })();
 scope.inflight.add(work);try{return await work;}finally{scope.inflight.delete(work);}
}
export async function runJobBudget({env,store,gate,limit=220,deadlineMs=25000,cacheSources=false,acceptance,now=()=>Date.now()},operation,withEnvironment=(_env,f)=>f()){
 installJobFetch();const scope={id:crypto.randomUUID(),store,gate,limit,cacheSources,acceptance,now,used:0,costs:{},cacheHits:0,inflight:new Set(),abort:new AbortController(),paused:null,closed:false};
 const scopedEnv={...env,VINEXT_KV_CACHE:budgetBinding(env.VINEXT_KV_CACHE,scope)};
 let timer;const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{try{fail(scope,'job_wall_deadline');}catch(e){reject(e);}},deadlineMs);});
 try{
  const result=await context.run(scope,()=>withEnvironment(scopedEnv,()=>Promise.race([operation(scopedEnv,scope),deadline])));
  if(scope.paused)throw scope.paused;
  // A Promise.race in a model route may leave official refreshes running.
  // Warm those public inputs, then retry the ranking build, not its fallback.
  if(scope.inflight.size){await Promise.race([Promise.allSettled([...scope.inflight]),deadline]);throw new JobDeferred('source_warmup_retry',Date.now()+1000);}
  return {result,usage:{used:scope.used,limit,costs:scope.costs,cacheHits:scope.cacheHits}};
 }catch(e){const error=scope.paused||e;error.usage={used:scope.used,limit,costs:scope.costs,cacheHits:scope.cacheHits};throw error;}
 finally{clearTimeout(timer);scope.closed=true;scope.abort.abort(new JobDeferred('job_phase_closed'));}
}
export function encode(value){return gzipSync(JSON.stringify(value)).toString('base64');}
export function decode(value){return JSON.parse(gunzipSync(Buffer.from(value,'base64')).toString('utf8'));}
