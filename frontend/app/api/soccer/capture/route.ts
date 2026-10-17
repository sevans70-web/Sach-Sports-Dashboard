import {NextRequest,NextResponse} from "next/server";
import {SOCCER_LEAGUES} from "@/lib/soccer";
export const dynamic="force-dynamic";
export const revalidate=0;
async function capture(req:NextRequest){
 const league=req.nextUrl.searchParams.get("league");
 if(league&&!SOCCER_LEAGUES.some(x=>x[1]===league))return NextResponse.json({success:false,error:"Unsupported league"},{status:400});
 const leagues=league?[league]:SOCCER_LEAGUES.map(x=>x[1]),results:any[]=[];
 for(let i=0;i<leagues.length;i+=2)await Promise.all(leagues.slice(i,i+2).map(async league=>{
  try{
   const response=await fetch(`${req.nextUrl.origin}/api/soccer/dashboard?league=${encodeURIComponent(league)}`,{cache:"no-store",signal:AbortSignal.timeout(45_000)});
   const payload=await response.json();
   results.push({league,success:response.ok&&payload.success!==false,verifiedPredictions:payload.pregameCapture?.verifiedPredictions||0,writable:payload.pregameCapture?.writable!==false});
  }catch{results.push({league,success:false,verifiedPredictions:0,error:"Soccer capture request failed"})}
 }));
 const verifiedPredictions=results.reduce((sum,r)=>sum+r.verifiedPredictions,0);
 return NextResponse.json({success:results.every(r=>r.success&&r.writable)&&verifiedPredictions>0,verifiedPredictions,leagues:results,warning:verifiedPredictions===0?"No verified pregame soccer props with usable player history are available for capture":undefined,updatedAt:new Date().toISOString()},{headers:{"Cache-Control":"no-store"}});
}
export const GET=capture;
export const POST=capture;
