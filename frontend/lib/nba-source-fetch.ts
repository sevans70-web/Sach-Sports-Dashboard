import {boundedWork} from '@/lib/bounded-work';
import {dashboardJobContext} from '@/lib/dashboard-job-context';
import {nbaRankingSignal} from '@/lib/nba-ranking-work';
import {providerFetch} from '@/lib/provider-fetch';

const admission=boundedWork(4,64,8000);
const origins=new Set(['https://site.api.espn.com','https://site.web.api.espn.com']);
let scoreboardRetryAt=0;

async function readScoreboard(response:Response,signal:AbortSignal):Promise<unknown>{
 if(!response.body)throw Error('NBA scoreboard body is missing');
 const reader=response.body.getReader(),decoder=new TextDecoder();
 let bytes=0,body='';
 try{
  while(true){
   const {done,value}=await reader.read();
   signal.throwIfAborted();
   if(done)break;
   bytes+=value.byteLength;
   if(bytes>2*1024*1024)throw Error('NBA scoreboard response is too large');
   body+=decoder.decode(value,{stream:true});
  }
  return JSON.parse(body+decoder.decode());
 }catch(error){void reader.cancel().catch(()=>{});throw error;}
}

export async function nbaSourceFetch(url:string,validate:(payload:unknown)=>any,caller?:AbortSignal){
 const source=new URL(url);
 const scoreboard=origins.has(source.origin)&&source.pathname==='/apis/site/v2/sports/basketball/nba/scoreboard';
 const job=dashboardJobContext();
 const deadline=AbortSignal.timeout(8000);
 const signal=nbaRankingSignal(caller?AbortSignal.any([caller,deadline]):deadline)!;
 const read=async()=>{
  job?.assertActive();
  signal.throwIfAborted();
  if(scoreboard&&!job&&Date.now()<scoreboardRetryAt)throw Error('NBA scoreboard provider rate limited');
  const options:RequestInit={headers:{Accept:'application/json','User-Agent':'Mozilla/5.0 (compatible; SachSports/1.0)'},cache:'no-store',signal};
  const response=scoreboard?await globalThis.fetch(url,{...options,redirect:'manual'}):await providerFetch(url,options);
  if(scoreboard&&[301,302,303,307,308].includes(response.status)){
   void response.body?.cancel().catch(()=>{});
   throw Error('official_source_redirect_rejected');
  }
  if(scoreboard&&!job&&response.status===429){
   const retry=response.headers.get('Retry-After');
   const seconds=retry?Number(retry):NaN;
   const until=Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retry||'');
   scoreboardRetryAt=Math.max(Date.now()+60000,Number.isFinite(until)?until:0);
  }
  signal.throwIfAborted();
  if(!response.ok){void response.body?.cancel().catch(()=>{});throw Error(`Provider returned ${response.status}`);}
  const payload=scoreboard?await readScoreboard(response,signal):await response.json();
  const value=validate(payload);
  signal.throwIfAborted();
  job?.assertActive();
  return value;
 };
 return job?read():admission.run(read);
}
