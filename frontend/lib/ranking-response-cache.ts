/** Reuse completed boards across cards and summaries; refresh without blocking
 * navigation. Never carry a pregame response through a tipoff or calendar day. */
const memory=globalThis as typeof globalThis&{__rankingResponses?:Map<string,{at:number;value:any;boundary:number}>,__rankingRequests?:Map<string,Promise<any>>,__nhlRankingStarted?:Map<string,number>};
const cache=memory.__rankingResponses??=new Map();
const pending=memory.__rankingRequests??=new Map();
const starts=memory.__nhlRankingStarted??=new Map<string,number>();
export async function rankingResponse(key:string,build:()=>Promise<any>,force=false,options:{keepAlive?:(work:Promise<any>)=>void;timeoutMs?:number}={}){
 const hockey=key.startsWith("nhl|"),timeout=options.timeoutMs??25000;
 const now=Date.now(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(now),id=day+'|'+key;
 const hit=cache.get(id);
 const usable=hit&&now-hit.at<60_000&&now<hit.boundary;
 if(!force&&usable&&now-hit.at<20_000)return hit.value;
 if(hockey&&pending.has(id)&&now-(starts.get(id)||0)>=timeout){pending.delete(id);starts.delete(id);}
 let work=pending.get(id);let registered=false;
 if(!work){
  let timer:ReturnType<typeof setTimeout>|undefined;
  const built=Promise.resolve().then(build);
  const bounded=hockey?Promise.race([built,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error("NHL rankings refresh timed out; please retry")),timeout);})]):built;
  work=bounded.then(value=>{
   if(pending.get(id)===work&&value?.success!==false&&value?.rows?.length){
    const times=value.rows.map((r:any)=>Date.parse(r.gameTime)).filter((n:number)=>Number.isFinite(n)&&n>Date.now());
    if(cache.size>128)cache.delete(cache.keys().next().value!);
    cache.set(id,{at:Date.now(),value,boundary:times.length?Math.min(...times):Infinity});
   }
   return value;
  }).finally(()=>{if(timer)clearTimeout(timer);if(pending.get(id)===work){pending.delete(id);starts.delete(id);}});
  pending.set(id,work);if(hockey)starts.set(id,now);
 }
 if(hockey&&options.keepAlive)try{options.keepAlive(work);registered=true;}catch{}
 if(!force&&usable&&(!hockey||registered)){void work.catch(()=>{});return hit.value;}
 return work;
}
