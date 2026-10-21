import {NextRequest,NextResponse} from "next/server";
import {GET as nfl} from "../nfl/performance/route";
import {GET as cfb} from "../cfb/performance/route";
import {GET as nba} from "../nba/performance/route";
import {GET as wnba} from "../wnba/performance/route";
import {GET as nhl} from "../nhl/performance/route";
import {GET as cbb} from "../cbb/performance/route";
import {GET as soccer} from "../soccer/performance/route";
import {GET as mlb} from "../mlb/performance/route";
import {VISIBLE_SPORTS,DEFAULT_MARKETS,dashboardDay} from "@/lib/dashboard-contract";
export const dynamic="force-dynamic";
let cached:{at:number,payload:any}|null=null,pending:Promise<any>|null=null;
const handlers:Record<string,any>={nfl,cfb,nba,wnba,nhl,cbb,soccer,mlb};
export async function GET(req:NextRequest){
 if(cached&&Date.now()-cached.at<60_000)return NextResponse.json(cached.payload);
 if(!pending)pending=(async()=>{
  const sports:any[]=[];
  for(let i=0;i<VISIBLE_SPORTS.length;i+=3)await Promise.all(VISIBLE_SPORTS.slice(i,i+3).map(async sport=>{
   try{
    let timer:ReturnType<typeof setTimeout>|undefined;
    let response:Response;
    try{response=await Promise.race([handlers[sport](new NextRequest(`${req.nextUrl.origin}/api/${sport}/performance?period=Today&market=${DEFAULT_MARKETS[sport]}&league=eng.1`)),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("Grading feed is still updating")),10_000)})]);}finally{clearTimeout(timer)}
    const d=await response.json();
    if(sport==="mlb"){
     const rows=d.batter?.days?.[dashboardDay(new Date())]?.categories?.home_runs||[],settled=rows.filter((r:any)=>typeof r.correct==="boolean");
     sports.push({sport,connected:d.success!==false,hits:settled.filter((r:any)=>r.correct).length,settled:settled.length,pending:rows.length-settled.length});
    }else {
     const picks=d.sachPickPerformance||d;
     sports.push({sport,connected:response.ok&&picks.connected!==false&&d.success!==false,hits:Number(picks.hits)||0,settled:Number(picks.settled)||0,pending:Number(picks.pending)||0});
    }
   }catch{sports.push({sport,connected:false,hits:0,settled:0,pending:0})}
  }));
  const hits=sports.reduce((n,s)=>n+s.hits,0),settled=sports.reduce((n,s)=>n+s.settled,0),payload={success:sports.every(s=>s.connected),partial:sports.some(s=>!s.connected),hits,settled,pending:sports.reduce((n,s)=>n+s.pending,0),hitRate:settled?Math.round(hits/settled*1000)/10:null,sports,scope:"Today · default ranking markets",updatedAt:new Date().toISOString()};
  cached={at:Date.now(),payload};return payload;
 })().finally(()=>pending=null);
 return NextResponse.json(await pending,{headers:{"Cache-Control":"no-store"}});
}
