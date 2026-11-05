/** Public provider transport. Memory-only: never touches durable history or backups. */
type ProviderPayload={status:number;headers:Headers;body:string};
type ProviderState={cache:Map<string,ProviderPayload&{expires:number;bytes:number}>;pending:Map<string,Promise<ProviderPayload>>;bytes:number};
const shared=globalThis as typeof globalThis&{__sachProviderTransportV2?:ProviderState};
const state=shared.__sachProviderTransportV2||(shared.__sachProviderTransportV2={cache:new Map(),pending:new Map(),bytes:0});
const {cache,pending}=state;
const MAX_CACHE_BYTES=32*1024*1024,MAX_ENTRY_BYTES=8*1024*1024;
function removeCached(key:string){const old=cache.get(key);if(old){state.bytes-=old.bytes;cache.delete(key);}}
function responseFrom(value:ProviderPayload){return new Response([204,205,304].includes(value.status)?null:value.body,{status:value.status,headers:value.headers});}
export function providerCacheStatus(){return {entries:cache.size,bytes:state.bytes,maxBytes:MAX_CACHE_BYTES,pending:pending.size};}
export async function providerFetch(input:string | URL | Request, init?:RequestInit):Promise<Response> {
  const url = String(input);
  const host = new URL(url).hostname;
  const publicProvider = ["site.api.espn.com", "site.web.api.espn.com", "api-web.nhle.com", "api.nhle.com"].includes(host);
  if (!publicProvider || (init?.method && init.method !== "GET")) {
    return globalThis.fetch(input, {...init, signal:init?.signal ?? AbortSignal.timeout(10_000)});
  }
  for(const [key,value] of cache)if(value.expires<=Date.now())removeCached(key);
  const hit=cache.get(url);
  if(hit && hit.expires>Date.now()) return responseFrom(hit);
  const running=pending.get(url);
  if(running) return responseFrom(await running);
  const work=(async()=>{
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
    if(response.ok){
      const ttl=/statistics|\/stats[/?]|\/roster|byathlete/.test(url)?15*60_000:30_000;
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
  pending.set(url,work);
  try{return responseFrom(await work)}finally{pending.delete(url)}
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
