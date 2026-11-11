import {NextRequest,NextResponse} from "next/server";
import {GET as nfl} from "../nfl/performance/route";
import {GET as nba} from "../nba/performance/route";
import {GET as nhl} from "../nhl/performance/route";

// The home page describes *recent* prediction accuracy, not just a single
// default market on the current day. Use seven days of saved, graded NBA/NFL/NHL
// predictions, matching Results & History (hits / hits + misses, no pushes).
export const dynamic="force-dynamic";
const SOURCES = [
  {sport:"nba",handler:nba},
  {sport:"nhl",handler:nhl},
  {sport:"nfl",group:"QB",handler:nfl},
  {sport:"nfl",group:"Offense",handler:nfl},
  {sport:"nfl",group:"Defense",handler:nfl},
] as const;
type Result={sport:string;group?:string;connected:boolean;hits:number;settled:number;pending:number};
let cached:{at:number;payload:any}|null=null;
let pending:Promise<any>|null=null;
const integer=(v:unknown)=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0?v:0;
async function source(req:NextRequest,entry:typeof SOURCES[number]):Promise<Result>{
 const url=new URL(`/api/${entry.sport}/performance`,req.nextUrl.origin);
 url.searchParams.set("period","Week");
 if("group" in entry&&entry.group)url.searchParams.set("group",entry.group);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const response=await Promise.race([
   entry.handler(new NextRequest(url)),
   new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Performance source timed out")),30_000)}),
  ]);
  const data=await response.json();
  const result=(data.sachPickPerformance&&typeof data.sachPickPerformance==="object")?data.sachPickPerformance:data;
  const connected=response.ok&&data.success!==false&&result.connected!==false&&data.historyPartial!==true;
  return {sport:entry.sport,...("group" in entry?{group:entry.group}:{}),connected,hits:connected?integer(result.hits):0,settled:connected?integer(result.settled):0,pending:connected?integer(result.pending):0};
 }catch{
  return {sport:entry.sport,...("group" in entry?{group:entry.group}:{}),connected:false,hits:0,settled:0,pending:0};
 }finally{clearTimeout(timer)}
}
export async function GET(req:NextRequest){
 if(cached&&Date.now()-cached.at<120_000)return NextResponse.json(cached.payload,{headers:{"Cache-Control":"no-store"}});
 if(!pending)pending=(async()=>{
  const sports=await Promise.all(SOURCES.map(entry=>source(req,entry)));
  const hits=sports.reduce((n,s)=>n+s.hits,0);
  const settled=sports.reduce((n,s)=>n+s.settled,0);
  const partial=sports.some(s=>!s.connected);
  const payload={success:!partial,partial,hits,settled,pending:sports.reduce((n,s)=>n+s.pending,0),
   hitRate:settled?Math.round(hits/settled*1000)/10:null,
   sports,scope:"Last 7 calendar days · NBA/NFL/NHL · all tracked markets",
   updatedAt:new Date().toISOString()};
  // Never cache an all-source failure as a legitimate 0% hit rate.
  if(sports.some(s=>s.connected))cached={at:Date.now(),payload};
  return payload;
 })().finally(()=>{pending=null});
 return NextResponse.json(await pending,{headers:{"Cache-Control":"no-store"}});
}
