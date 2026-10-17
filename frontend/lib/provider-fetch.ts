/** Public provider transport. Memory-only: never touches durable history or backups. */
const cache = new Map<string, {expires:number; status:number; headers:Headers; body:string}>();
const pending = new Map<string, Promise<Response>>();
export async function providerFetch(input:string | URL | Request, init?:RequestInit):Promise<Response> {
  const url = String(input);
  const host = new URL(url).hostname;
  const publicProvider = ["site.api.espn.com", "site.web.api.espn.com", "api-web.nhle.com", "api.nhle.com"].includes(host);
  if (!publicProvider || (init?.method && init.method !== "GET")) {
    return globalThis.fetch(input, {...init, signal:init?.signal ?? AbortSignal.timeout(10_000)});
  }
  const hit=cache.get(url);
  if(hit && hit.expires>Date.now()) return new Response(hit.body,{status:hit.status,headers:hit.headers});
  const running=pending.get(url);
  if(running) return (await running).clone();
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
      if(retry.ok)response=retry;
    }
    if(response.ok){
      const body=await response.text();
      const ttl=/statistics|\/stats[/?]|\/roster|byathlete/.test(url)?15*60_000:30_000;
      if(cache.size>=1024)cache.delete(cache.keys().next().value!);
      cache.set(url,{expires:Date.now()+ttl,status:response.status,headers:response.headers,body});
      return new Response(body,{status:response.status,headers:response.headers});
    }
    console.warn("[provider unavailable]",host,new URL(url).pathname,response.status,response.headers.get("content-type"));
    return response;
  })();
  pending.set(url,work);
  try{return (await work).clone()}finally{pending.delete(url)}
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
