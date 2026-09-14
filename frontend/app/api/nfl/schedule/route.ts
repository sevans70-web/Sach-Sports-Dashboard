import {NextResponse} from "next/server";
import {cleanName} from "@/lib/nfl";
import {getEspnNflSchedule,getPropQualifiedGames,getNflTeamRoster} from "@/lib/nfl-server";

export const dynamic="force-dynamic";

function orderGames(games:any[]){
  return [...games].sort((a,b)=>{
    const bucket=(g:any)=>g.state==="in"?0:g.state==="pre"?1:2;
    const ba=bucket(a),bb=bucket(b);
    if(ba!==bb)return ba-bb;

    const ta=new Date(a.date).getTime();
    const tb=new Date(b.date).getTime();

    // Upcoming games: earliest first. Finals: most recently finished first.
    if(ba===2)return (Number.isFinite(tb)?tb:0)-(Number.isFinite(ta)?ta:0);
    return (Number.isFinite(ta)?ta:Number.MAX_SAFE_INTEGER)-(Number.isFinite(tb)?tb:Number.MAX_SAFE_INTEGER);
  });
}

export async function GET(){
  try{
    const[schedule,q]=await Promise.all([getEspnNflSchedule(),getPropQualifiedGames()]);
    const wanted=new Map(q.map(x=>[cleanName(x.matchup),x]));
    const decorated=schedule.map((g:any)=>{
      const matchup=`${g.awayTeam} @ ${g.homeTeam}`;
      const hit=wanted.get(cleanName(matchup));
      return {...g,matchup,availableProps:hit?.props||[],propQualified:Boolean(hit)};
    });
    const qualified=decorated.filter((g:any)=>g.propQualified);

    // Keep the weekly slate visible. Live games rise to the top, upcoming games
    // follow, and completed games stay visible at the bottom as FINAL.
    const baseGames=orderGames(qualified.length?qualified:decorated);
    const rosterCache=new Map<string,Promise<any>>();
    const roster=(id:string)=>{
      if(!id)return Promise.resolve({players:[]});
      if(!rosterCache.has(id))rosterCache.set(id,getNflTeamRoster(id));
      return rosterCache.get(id)!;
    };
    const games=await Promise.all(baseGames.map(async(g:any)=>{
      const [awayRoster,homeRoster]=await Promise.all([roster(String(g.awayTeamId||"")),roster(String(g.homeTeamId||""))]);
      const firstQb=(r:any)=>r?.players?.find((p:any)=>String(p.position||"").toUpperCase()==="QB")?.name||"";
      return {...g,awayQb:firstQb(awayRoster),homeQb:firstQb(homeRoster)};
    }));
    const totalLineups=games.length*2;
    const confirmedLineups=games.filter((g:any)=>g.state==="in"||g.completed||g.state==="post").length*2;
    const weekNumber=games.map((g:any)=>Number(g.weekNumber||0)).find((n:number)=>n>0)||null;

    return NextResponse.json({
      success:true,
      games,
      qualifiedCount:q.length,
      totalLineups,
      confirmedLineups,
      pendingLineups:Math.max(0,totalLineups-confirmedLineups),
      weekNumber,
      filterMode:qualified.length?"prop_qualified":"schedule_fallback",
      updatedAt:new Date().toISOString(),
    });
  }catch(e){
    return NextResponse.json({
      success:false,
      games:[],
      qualifiedCount:0,
      filterMode:"error",
      error:e instanceof Error?e.message:"NFL schedule unavailable",
    },{status:500});
  }
}
