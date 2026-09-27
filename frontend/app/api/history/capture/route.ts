import {NextRequest,NextResponse} from "next/server";
import {NFL_MARKETS} from "@/lib/nfl";
import {CFB_MARKETS} from "@/lib/cfb";
import {NBA_MARKETS} from "@/lib/nba";
import {WNBA_MARKETS} from "@/lib/wnba";
import {NHL_MARKETS} from "@/lib/nhl";
import {CBB_MARKETS} from "@/lib/cbb";
import {BATTER_MARKETS,PITCHER_MARKETS} from "@/lib/mlb";
import {appendHistorySnapshot,historyArchiveStatus,torontoHistoryDay} from "@/lib/history-archive";
export const runtime="nodejs";export const dynamic="force-dynamic";export const revalidate=0;
async function fetchJson(origin:string,path:string){try{const r=await fetch(`${origin}${path}`,{cache:"no-store",headers:{"x-sach-history-capture":"1"}});const payload=await r.json().catch(()=>null);return{ok:r.ok,status:r.status,payload}}catch(e){return{ok:false,status:0,payload:null,error:e instanceof Error?e.message:String(e)}}
async function capture(origin:string,sport:string,stream:string,path:string,day:string){const x=await fetchJson(origin,path);if(!x.ok)return{sport,stream,path,ok:false,status:x.status,error:(x as any).error};const saved=await appendHistorySnapshot(sport,stream,x.payload,day);return{sport,stream,path,ok:true,written:saved.written,count:saved.count}}
async function marketSet(origin:string,sport:string,base:string,markets:readonly any[],day:string){const out:any[]=[];for(let i=0;i<markets.length;i+=4){out.push(...await Promise.all(markets.slice(i,i+4).map((m:any)=>capture(origin,sport,String(m[0]),`${base}?market=${encodeURIComponent(String(m[0]))}`,day))))}return out}
export async function GET(req:NextRequest){
 const storage=await historyArchiveStatus();if(!storage.ok)return NextResponse.json({success:false,storage},{status:503});
 const origin=req.nextUrl.origin,day=torontoHistoryDay();const results:any[]=[];
 results.push(...await marketSet(origin,"nfl","/api/nfl/rankings",NFL_MARKETS,day));
 results.push(...await marketSet(origin,"cfb","/api/cfb/rankings",CFB_MARKETS,day));
 results.push(...await marketSet(origin,"nba","/api/nba/rankings",NBA_MARKETS,day));
 results.push(...await marketSet(origin,"wnba","/api/wnba/rankings",WNBA_MARKETS,day));
 results.push(...await marketSet(origin,"nhl","/api/nhl/rankings",NHL_MARKETS,day));
 results.push(...await marketSet(origin,"cbb","/api/cbb/rankings",CBB_MARKETS,day));
 results.push(...await marketSet(origin,"mlb","/api/mlb/rankings",[...BATTER_MARKETS,...PITCHER_MARKETS],day));
 // Soccer is built as one dashboard payload rather than one rankings endpoint per market.
 results.push(await capture(origin,"soccer","dashboard","/api/soccer/dashboard",day));
 const failed=results.filter(x=>!x.ok);return NextResponse.json({success:failed.length===0,storage,day,captured:results.length,failed:failed.length,results,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(req:NextRequest){return GET(req)}
