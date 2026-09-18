import {NextResponse} from "next/server";
import {CFB_MARKETS,cleanName,type CfbMarketKey} from "@/lib/cfb";
import {getEspnCfbSchedule} from "@/lib/cfb-server";
import {getOwlsQualifiedGames} from "@/lib/cfb-owls";

export const dynamic="force-dynamic"; export const revalidate=0;
function orderGames(games:any[]){return [...games].sort((a,b)=>{const bucket=(g:any)=>g.state==="in"?0:g.state==="pre"?1:2,ba=bucket(a),bb=bucket(b);if(ba!==bb)return ba-bb;const ta=new Date(a.date).getTime(),tb=new Date(b.date).getTime();return ba===2?(Number.isFinite(tb)?tb:0)-(Number.isFinite(ta)?ta:0):(Number.isFinite(ta)?ta:Number.MAX_SAFE_INTEGER)-(Number.isFinite(tb)?tb:Number.MAX_SAFE_INTEGER)})}
function slug(v:string){return cleanName(v).replace(/\s+/g,"-")}
export async function GET(){
  try{
    const markets: CfbMarketKey[]=CFB_MARKETS.map(x=>x[0]);
    const [schedule,q]=await Promise.all([getEspnCfbSchedule(),getOwlsQualifiedGames(markets)]);
    const scheduleMap=new Map(schedule.map((g:any)=>[cleanName(`${g.awayTeam} @ ${g.homeTeam}`),g]));
    const merged:any[]=[];
    for(const item of q){
      const k=cleanName(item.matchup),espn=scheduleMap.get(k);
      if(espn){merged.push({...espn,matchup:item.matchup,availableProps:item.props,propQualified:true});scheduleMap.delete(k);continue}
      const [awayTeam="Away",homeTeam="Home"]=item.matchup.split(" @ ");
      merged.push({id:item.eventId||`owls-${slug(item.matchup)}`,date:item.gameTime||"",awayTeam,homeTeam,awayTeamId:"",homeTeamId:"",awayLogo:"",homeLogo:"",awayScore:null,homeScore:null,awayRecord:"",homeRecord:"",status:"Scheduled",state:"pre",completed:false,venue:"",broadcasts:[],matchup:item.matchup,availableProps:item.props,propQualified:true,source:"owls"});
    }
    const remaining=[...scheduleMap.values()].map((g:any)=>({...g,matchup:`${g.awayTeam} @ ${g.homeTeam}`,availableProps:[],propQualified:false}));
    const games=merged.length?merged:remaining;
    return NextResponse.json({success:true,games:orderGames(games),qualifiedCount:merged.length,filterMode:merged.length?"prop_qualified":"schedule_fallback",updatedAt:new Date().toISOString()});
  }catch(e){return NextResponse.json({success:false,games:[],qualifiedCount:0,filterMode:"error",error:e instanceof Error?e.message:"CFB schedule unavailable"},{status:500})}
}
