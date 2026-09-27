import {NextRequest,NextResponse} from "next/server";
import {CFB_MARKETS} from "@/lib/cfb";
import {NFL_MARKETS} from "@/lib/nfl";
import {NBA_MARKETS} from "@/lib/nba";
import {WNBA_MARKETS} from "@/lib/wnba";
import {NHL_MARKETS} from "@/lib/nhl";
import {CBB_MARKETS} from "@/lib/cbb";
import {durableHistoryStatus,appendDurableSnapshot,torontoHistoryDay} from "@/lib/durable-history";
export const dynamic="force-dynamic"; export const revalidate=0;
async function fetchJson(origin:string,path:string){try{const r=await fetch(`${origin}${path}`,{cache:"no-store"});let payload:any=null;try{payload=await r.json()}catch{}return {path,ok:r.ok,status:r.status,payload}}catch(e){return {path,ok:false,status:0,payload:null,error:e instanceof Error?e.message:String(e)}}}
async function batches<T>(items:T[],size:number,fn:(x:T)=>Promise<any>){const out:any[]=[];for(let i=0;i<items.length;i+=size)out.push(...await Promise.all(items.slice(i,i+size).map(fn)));return out}
async function captureMarketRoutes(origin:string,sport:string,markets:readonly any[],path:(m:string)=>string){const day=torontoHistoryDay();return batches(markets.map((x:any)=>String(Array.isArray(x)?x[0]:x)),4,async m=>{const r=await fetchJson(origin,path(m));if(r.ok&&r.payload)await appendDurableSnapshot(sport,m,day,r.payload);return {market:m,ok:r.ok,status:r.status}})}
export async function GET(req:NextRequest){
 const storage=await durableHistoryStatus(); if(!storage.ok)return NextResponse.json({success:false,storage},{status:503});
 const origin=req.nextUrl.origin,day=torontoHistoryDay();
 const [cfb,nfl,nba,wnba,nhl,cbb,mlb,soccer]=await Promise.all([
  captureMarketRoutes(origin,"cfb",CFB_MARKETS,m=>`/api/cfb/rankings?market=${encodeURIComponent(m)}`),
  captureMarketRoutes(origin,"nfl",NFL_MARKETS,m=>`/api/nfl/rankings?market=${encodeURIComponent(m)}`),
  captureMarketRoutes(origin,"nba",NBA_MARKETS,m=>`/api/nba/rankings?market=${encodeURIComponent(m)}`),
  captureMarketRoutes(origin,"wnba",WNBA_MARKETS,m=>`/api/wnba/rankings?market=${encodeURIComponent(m)}`),
  captureMarketRoutes(origin,"nhl",NHL_MARKETS,m=>`/api/nhl/rankings?market=${encodeURIComponent(m)}`),
  captureMarketRoutes(origin,"cbb",CBB_MARKETS,m=>`/api/cbb/rankings?market=${encodeURIComponent(m)}`),
  (async()=>{const r=await fetchJson(origin,"/api/mlb/rankings");if(r.ok&&r.payload)await appendDurableSnapshot("mlb","rankings",day,r.payload);const p=await fetchJson(origin,"/api/mlb/performance");if(p.ok&&p.payload)await appendDurableSnapshot("mlb","performance",day,p.payload);return {rankings:r.ok,performance:p.ok}})(),
  (async()=>{const r=await fetchJson(origin,"/api/soccer/dashboard");if(r.ok&&r.payload)await appendDurableSnapshot("soccer","dashboard",day,r.payload);return {dashboard:r.ok,status:r.status}})()
 ]);
 return NextResponse.json({success:true,storage,day,cfb,nfl,nba,wnba,nhl,cbb,mlb,soccer,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){return GET(req)}
