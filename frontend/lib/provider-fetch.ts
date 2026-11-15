/** Public provider transport. Memory-only: never touches durable history or backups. */
type ProviderPayload={status:number;headers:Headers;body:string};
type ProviderState={cache:Map<string,ProviderPayload&{expires:number;bytes:number}>;pending:Map<string,Promise<ProviderPayload>>;bytes:number;nhlStarted?:Map<string,number>};
const shared=globalThis as typeof globalThis&{__sachProviderTransportV2?:ProviderState};
const state:ProviderState=shared.__sachProviderTransportV2||(shared.__sachProviderTransportV2={cache:new Map(),pending:new Map(),bytes:0});
const {cache,pending}=state;
const MAX_CACHE_BYTES=32*1024*1024,MAX_ENTRY_BYTES=8*1024*1024;
function removeCached(key:string){const old=cache.get(key);if(old){state.bytes-=old.bytes;cache.delete(key);}}
function responseFrom(value:ProviderPayload){return new Response([204,205,304].includes(value.status)?null:value.body,{status:value.status,headers:value.headers});}
export function providerCacheStatus(){return {entries:cache.size,bytes:state.bytes,maxBytes:MAX_CACHE_BYTES,pending:pending.size};}
export async function providerFetch(input:string | URL | Request, init?:RequestInit):Promise<Response> {
  const url = String(input);
  const host = new URL(url).hostname;
  const nhlStarted=state.nhlStarted??=new Map<string,number>();
  const publicProvider = ["site.api.espn.com", "site.web.api.espn.com", "api-web.nhle.com", "api.nhle.com"].includes(host);
  if (!publicProvider || (init?.method && init.method !== "GET")) {
    return globalThis.fetch(input, {...init, signal:init?.signal ?? AbortSignal.timeout(10_000)});
  }
  for(const [key,value] of cache)if(value.expires<=Date.now())removeCached(key);
  const hit=cache.get(url);
  if(hit && hit.expires>Date.now()) return responseFrom(hit);
  const hockey=host==='api-web.nhle.com'||host==='api.nhle.com';
  if(hockey&&pending.has(url)&&Date.now()-(nhlStarted.get(url)||0)>=8500){pending.delete(url);nhlStarted.delete(url);}
  const running=pending.get(url);
  if(running){
    if(!hockey)return responseFrom(await running);
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return responseFrom(await Promise.race([running,new Promise<ProviderPayload>((_,reject)=>{timer=setTimeout(()=>reject(Error('NHL provider read timed out')),8000);})]));}
    finally{if(timer)clearTimeout(timer);if(pending.get(url)===running){pending.delete(url);nhlStarted.delete(url);}}
  }
  let work!:Promise<ProviderPayload>;
  work=(async()=>{
    const headers=new Headers(init?.headers);
    headers.set("Accept","application/json");
    headers.set("User-Agent","Mozilla/5.0 (compatible; SachSports/1.0)");
    const options={...init,headers,cache:"no-store" as RequestCache,signal:init?.signal ?? AbortSignal.timeout(8_000)};
    let response=await globalThis.fetch(input,options);
    // ESPN serves the same public site/common APIs on both official hosts.
    if([403,429,502,503,504].includes(response.status) && host.endsWith(".espn.com")) {
      const alternate=new URL(url);
      alternate.hostname=host==="site.api.espn.com"?"site.web.api.espn.com":"site.api.espn.com";
      const retry=await globalThis.fetch(alternate,{...options,signal:init?.signal ?? AbortSignal.timeout(8_000)});
      if(retry.ok){await response.body?.cancel().catch(()=>{});response=retry;}else await retry.body?.cancel().catch(()=>{});
    }
    const body=await response.text();
    const value={body,status:response.status,headers:response.headers};
    if(response.ok&&(!hockey||pending.get(url)===work)){
      const ttl=/statistics|\/stats[/?]|\/roster|byathlete/.test(url)||host==='api-web.nhle.com'&&/\/player\/\d+\/game-log\//.test(url)?15*60_000:30_000;
      // Bound disposable response memory, not the durable prediction store.
      const bytes=body.length*2;
      if(bytes<=MAX_ENTRY_BYTES){
        removeCached(url);
        while(cache.size&&(cache.size>=1024||state.bytes+bytes>MAX_CACHE_BYTES))removeCached(cache.keys().next().value!);
        cache.set(url,{...value,expires:Date.now()+ttl,bytes});state.bytes+=bytes;
      }
    }else console.warn("[provider unavailable]",host,new URL(url).pathname,response.status,response.headers.get("content-type"));
    return value;
  })();
  pending.set(url,work);if(hockey)nhlStarted.set(url,Date.now());
  try{return responseFrom(await work)}finally{if(pending.get(url)===work){pending.delete(url);nhlStarted.delete(url);}}
}
export function nullableNumber(value:unknown):number|null {
  if(value==null || typeof value==="boolean" || (typeof value==="string" && !value.trim()))return null;
  const n=Number(value);return Number.isFinite(n)?n:null;
}

/** Box-score values: an absent stat is unknown; a reported zero is a result. */
export function statNumber(value:unknown):number|null {
 if(value==null||typeof value==="boolean")return null;
 return nullableNumber(String(value).replaceAll(",","").trim());
}
