import { NextResponse } from "next/server";
import { cleanName } from "@/lib/cfb";
import { getEspnCfbSchedule,getPropQualifiedGames } from "@/lib/cfb-server";

export const dynamic="force-dynamic";

export async function GET(){
  try{
    const [schedule,q]=await Promise.all([getEspnCfbSchedule(),getPropQualifiedGames()]);
    const wanted=new Map(q.map(x=>[cleanName(x.matchup),x]));
    const decorated=schedule.map((g:any)=>{
      const matchup=`${g.awayTeam} @ ${g.homeTeam}`;
      const hit=wanted.get(cleanName(matchup));
      return {...g,matchup,availableProps:hit?.props||[],propQualified:Boolean(hit)};
    });
    const qualified=decorated.filter((g:any)=>g.propQualified);

    // Player-prop qualified games remain preferred. When sportsbooks have not
    // posted CFB player props yet, keep the real ESPN slate visible instead of
    // showing an empty page.
    const games=qualified.length?qualified:decorated;
    return NextResponse.json({
      success:true,
      games,
      qualifiedCount:q.length,
      filterMode:qualified.length?"prop_qualified":"schedule_fallback",
      updatedAt:new Date().toISOString(),
    });
  }catch(e){
    return NextResponse.json({
      success:false,
      games:[],
      qualifiedCount:0,
      filterMode:"error",
      error:e instanceof Error?e.message:"CFB schedule unavailable",
    },{status:500});
  }
}
