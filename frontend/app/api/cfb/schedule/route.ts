import {NextResponse} from "next/server";
import {CFB_MARKETS,cleanName,type CfbMarketKey} from "@/lib/cfb";
import {getEspnCfbSchedule} from "@/lib/cfb-server";
import {getOwlsQualifiedGames} from "@/lib/cfb-owls";

export const dynamic="force-dynamic"; export const revalidate=0;

function orderGames(games:any[]){
  return [...games].sort((a,b)=>{
    const bucket=(g:any)=>g.state==="in"?0:g.state==="pre"?1:2;
    const ba=bucket(a),bb=bucket(b);if(ba!==bb)return ba-bb;
    const ta=new Date(a.date).getTime(),tb=new Date(b.date).getTime();
    if(ba===2)return (Number.isFinite(tb)?tb:0)-(Number.isFinite(ta)?ta:0);
    return (Number.isFinite(ta)?ta:Number.MAX_SAFE_INTEGER)-(Number.isFinite(tb)?tb:Number.MAX_SAFE_INTEGER);
  });
}
export async function GET(){
  try{
    const markets=CfbMarketKeyArray();
    const [schedule,q]=await Promise.all([getEspnCfbSchedule(),getOwlsQualifiedGames(markets)]);
    const wanted=new Map(q.map(x=>[cleanName(x.matchup),x]));
    const decorated=schedule.map((g:any)=>{
      const matchup=`${g.awayTeam} @ ${g.homeTeam}`,hit=wanted.get(cleanName(matchup));
      return {...g,matchup,availableProps:hit?.props||[],propQualified:Boolean(hit)};
    });
    const qualified=decorated.filter((g:any)=>g.propQualified);
    return NextResponse.json({success:true,games:orderGames(qualified.length?qualified:decorated),qualifiedCount:qualified.length,filterMode:qualified.length?"prop_qualified":"schedule_fallback",updatedAt:new Date().toISOString()});
  }catch(e){
    return NextResponse.json({success:false,games:[],qualifiedCount:0,filterMode:"error",error:e instanceof Error?e.message:"CFB schedule unavailable"},{status:500});
  }
}
function CfbMarketKeyArray():CfbMarketKey[]{return CFB_MARKETS.map(x=>x[0])}
