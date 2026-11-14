/** Research transport only. No quotes, official fixtures or final results are
 * cached. Durable gates survive eviction; Retry-After is never shortened. */
export class SourceDeferred extends Error{
 constructor(code,retryAt){super(code);this.retryAt=retryAt;this.sourceDeferred=true;}
}
export const deferredSource=e=>e?.sourceDeferred===true&&Number.isFinite(e.retryAt);
export function providerRetryAt(value,now,failures=1){
 const fallback=Math.min(15*60000,60000*2**Math.min(4,Math.max(0,failures-1)));
 const seconds=value!=null&&String(value).trim()!==''?Number(value):NaN;
 const date=Date.parse(value||'');
 const requested=Number.isFinite(seconds)&&seconds>=0?now+seconds*1000:Number.isFinite(date)?date:now;
 return Math.max(now+fallback,requested);
}
export function sourceCacheTtl(url){
 const u=new URL(url);if(u.origin!=='https://api-web.nhle.com')return 0;
 if(/^\/v1\/player\/\d+\/game-log\/\d{8}\/2$/.test(u.pathname))return 15*60000;
 if(/^\/v1\/roster\/[A-Z]{2,3}\/current$/.test(u.pathname)||u.pathname.startsWith('/v1/standings/'))return 15*60000;
 if(u.pathname.startsWith('/v1/schedule/'))return 60000;
 return 0;
}
function cacheablePayload(url,value){
 const path=new URL(url).pathname;
 if(path.includes('/game-log/'))return Array.isArray(value?.gameLog);
 if(path.includes('/roster/'))return Array.isArray(value?.forwards)&&Array.isArray(value?.defensemen)&&value.forwards.length+value.defensemen.length>0;
 if(path.includes('/standings/'))return Array.isArray(value?.standings);
 if(path.includes('/schedule/'))return Array.isArray(value?.gameWeek);
 return false;
}
export function sourceTransport({now,readGate,writeGate,readCache,writeCache,wait,assertActive=()=>{}}){
 const retrieved=new Map();
 return {
  async beforeRequest(url){
   assertActive();const origin=new URL(url).origin,state=readGate(origin)||{},at=now();
   if(state.blockedUntil>at)throw new SourceDeferred('source_cooldown',state.blockedUntil);
   const delay=Math.max(0,(state.nextAt||0)-at);if(delay)await wait(delay);
   assertActive();writeGate(origin,{...state,nextAt:now()+2000});
  },
  async rateLimited(url,retryAfter){
   const origin=new URL(url).origin,state=readGate(origin)||{},failures=(state.failures||0)+1;
   const until=providerRetryAt(retryAfter,now(),failures);writeGate(origin,{...state,failures,blockedUntil:Math.max(state.blockedUntil||0,until)});
   return new SourceDeferred('source_http_429',Math.max(state.blockedUntil||0,until));
  },
  async succeeded(url){
   const origin=new URL(url).origin,state=readGate(origin)||{};
   writeGate(origin,{...state,failures:0,blockedUntil:0});
  },
  async cached(url){
   if(!sourceCacheTtl(url))return null;const c=readCache(url);
   if(!c||c.observedAt>now()||c.expiresAt<=now())return null;
   retrieved.set(url,c.observedAt);return {value:c.value};
  },
  async remember(url,value){
   const at=now();retrieved.set(url,at);const ttl=sourceCacheTtl(url);if(ttl&&cacheablePayload(url,value))writeCache(url,{value,observedAt:at,expiresAt:at+ttl});
  },
  retrievedAt:url=>retrieved.get(url),
 };
}
