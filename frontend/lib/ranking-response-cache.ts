/** Reuse completed boards across cards and summaries; refresh without blocking
 * navigation. Never carry a pregame response through a tipoff or calendar day. */
const memory=globalThis as typeof globalThis&{__rankingResponses?:Map<string,{at:number;value:any;boundary:number}>,__rankingRequests?:Map<string,Promise<any>>};
const cache=memory.__rankingResponses??=new Map();
const pending=memory.__rankingRequests??=new Map();
export async function rankingResponse(key:string,build:()=>Promise<any>,force=false){
 const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(now),id=day+'|'+key;
 const hit=cache.get(id);
 const usable=hit&&now-hit.at<60_000&&now<hit.boundary;
 if(!force&&usable&&now-hit.at<20_000)return hit.value;
 let work=pending.get(id);
 if(!work){
  work=build().then(value=>{
   if(value?.success!==false&&value?.rows?.length){
    const times=value.rows.map((r:any)=>Date.parse(r.gameTime)).filter((n:number)=>Number.isFinite(n)&&n>Date.now());
    if(cache.size>128)cache.delete(cache.keys().next().value!);
    cache.set(id,{at:Date.now(),value,boundary:times.length?Math.min(...times):Infinity});
   }
   return value;
  }).finally(()=>pending.delete(id));
  pending.set(id,work);
 }
 if(!force&&usable){void work.catch(()=>{});return hit.value;}
 return work;
}
