import {NextResponse} from "next/server";
import {cloudConfigured,cloudRequest} from "../../../scripts/history-cloud.mjs";
import {NFL_MARKETS} from "@/lib/nfl";
import {NHL_MARKETS} from "@/lib/nhl";

// Home hit rate is the combined *all-recorded-history* performance of saved,
// graded NBA/NFL/NHL predictions. Never invoke expensive full-season grading
// endpoints on a homepage request. Those remain available in Results & History.
export const dynamic="force-dynamic";
type Grade="hit"|"miss"|"pending"|"push"|"void";
type Sport="nba"|"nfl"|"nhl";
type Tally={sport:Sport;hits:number;misses:number;pending:number;pushes:number;void:number;settled:number};
type Document={stream:string;game_date:string;payload:unknown};
const PAGE_SIZE=200;
const sources:{sport:Sport;filter:string}[]=[
 {sport:"nba",filter:"stream=like.model_pick_results_*"},
 {sport:"nfl",filter:`stream=in.(${NFL_MARKETS.map(m=>m[0]).join(",")})`},
 {sport:"nhl",filter:`stream=in.(${NHL_MARKETS.map(m=>m[0]).join(",")})`},
];
const empty=(sport:Sport):Tally=>({sport,hits:0,misses:0,pending:0,pushes:0,void:0,settled:0});
async function tallySport(sport:Sport,filter:string):Promise<Tally>{
 const result=empty(sport);
 for(let offset=0;;offset+=PAGE_SIZE){
  const path=`history_documents?select=stream,game_date,payload&sport=eq.${sport}&${filter}&order=game_date.asc,stream.asc&limit=${PAGE_SIZE}&offset=${offset}`;
  const rows=await cloudRequest(path,{signal:AbortSignal.timeout(15_000)}) as Document[];
  if(!Array.isArray(rows))throw Error("History documents response unavailable");
  for(const row of rows){
   if(!Array.isArray(row.payload))continue;
   for(const record of row.payload){
    if(!record||typeof record!=="object")continue;
    const status=(record as {status?:string}).status as Grade|undefined;
    if(status==="hit")result.hits++;
    else if(status==="miss")result.misses++;
    else if(status==="pending")result.pending++;
    else if(status==="push")result.pushes++;
    else if(status==="void")result.void++;
   }
  }
  if(rows.length<PAGE_SIZE)break;
  if(offset>=5000)throw Error("History document pagination exceeded safe limit");
 }
 result.settled=result.hits+result.misses;
 return result;
}
let cached:{at:number;payload:unknown}|null=null;
let running:Promise<unknown>|null=null;
export async function GET(){
 if(cached&&Date.now()-cached.at<300_000)return NextResponse.json(cached.payload,{headers:{"Cache-Control":"no-store"}});
 if(!cloudConfigured())return NextResponse.json({success:false,error:"Saved performance storage not configured",hitRate:null},{status:503});
 if(!running)running=(async()=>{
  const sports=await Promise.all(sources.map(s=>tallySport(s.sport,s.filter)));
  const hits=sports.reduce((n,s)=>n+s.hits,0);
  const misses=sports.reduce((n,s)=>n+s.misses,0);
  const settled=hits+misses;
  const payload={success:true,partial:false,scope:"Overall recorded results · NBA/NFL/NHL",hits,misses,settled,
    pending:sports.reduce((n,s)=>n+s.pending,0),
    hitRate:settled?Math.round(hits/settled*1000)/10:null,
    sports,updatedAt:new Date().toISOString()};
  cached={at:Date.now(),payload};return payload;
 })().finally(()=>{running=null});
 try{return NextResponse.json(await running,{headers:{"Cache-Control":"no-store"}})}
 catch(error){console.error("[platform-performance] overall read failed",error instanceof Error?error.message:String(error));
  if(cached)return NextResponse.json(cached.payload,{headers:{"Cache-Control":"no-store"}});
  return NextResponse.json({success:false,hitRate:null,error:"Overall performance temporarily unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
}
