import {attachFittedResearchForecasts} from '@/lib/live-model-forecast';
import {guardRankingPayload} from "@/lib/prop-integrity";
import {NextRequest,NextResponse} from "next/server";
import {type CbbMarketKey,CBB_MARKETS} from "@/lib/cbb";
import {buildCbbMarketRankings} from "@/lib/cbb-rankings-server";

export const dynamic="force-dynamic";

const allowed=new Set(CBB_MARKETS.map(x=>x[0]));
const g=globalThis as typeof globalThis & {
  __sachCbbRankingCache?: Map<string,{at:number;payload:any}>;
  __sachCbbRankingInflight?: Map<string,Promise<any>>;
};
const cache=g.__sachCbbRankingCache||(g.__sachCbbRankingCache=new Map());
const inflight=g.__sachCbbRankingInflight||(g.__sachCbbRankingInflight=new Map());
const FRESH_MS=60_000;
const STALE_MS=10*60_000;

async function build(market:CbbMarketKey){
  const payload=await buildCbbMarketRankings(market);
  cache.set(market,{at:Date.now(),payload});
  return payload;
}

export async function GET(req:NextRequest){
 const market=(req.nextUrl.searchParams.get("market")||"points") as CbbMarketKey;
 if(!allowed.has(market))return rankingJson({success:false,rows:[],error:"Unsupported CBB market"},{status:400});

 const hit=cache.get(market);
 const age=hit?Date.now()-hit.at:Infinity;
 if(hit&&age<FRESH_MS){
   return rankingJson({...hit.payload,cached:true},{status:200,headers:{"Cache-Control":"public, s-maxage=45, stale-while-revalidate=600"}});
 }
 if(hit&&age<STALE_MS){
   if(!inflight.has(market)){
     const work=build(market).catch(()=>hit.payload).finally(()=>inflight.delete(market));
     inflight.set(market,work);
   }
   return rankingJson({...hit.payload,cached:true,refreshing:true},{status:200,headers:{"Cache-Control":"public, s-maxage=45, stale-while-revalidate=600"}});
 }

 let work=inflight.get(market);
 if(!work){
   work=build(market).finally(()=>inflight.delete(market));
   inflight.set(market,work);
 }
 try{
   const payload=await work;
   return rankingJson(payload,{status:200,headers:{"Cache-Control":"public, s-maxage=45, stale-while-revalidate=600"}});
 }catch(e:any){
   if(hit)return rankingJson({...hit.payload,cached:true,error:String(e?.message||e)},{status:200});
   return rankingJson({success:false,market,rows:[],error:String(e?.message||e)},{status:200});
 }
}

async function rankingJson(payload:any,init?:ResponseInit){return NextResponse.json(await attachFittedResearchForecasts(guardRankingPayload(payload,"cbb"),"cbb"),init)}
