import {NextResponse} from "next/server";
import {CFB_MARKETS,cleanName,type CfbMarketKey} from "@/lib/cfb";
import {getEspnCfbSchedule,getCfbRankings} from "@/lib/cfb-server";
import {getOwlsQualifiedGames} from "@/lib/cfb-owls";

export const dynamic="force-dynamic"; export const revalidate=0;
function orderGames(games:any[]){return [...games].sort((a,b)=>{const bucket=(g:any)=>g.state==="in"?0:g.state==="pre"?1:2,ba=bucket(a),bb=bucket(b);if(ba!==bb)return ba-bb;const ta=new Date(a.date).getTime(),tb=new Date(b.date).getTime();return ba===2?(Number.isFinite(tb)?tb:0)-(Number.isFinite(ta)?ta:0):(Number.isFinite(ta)?ta:Number.MAX_SAFE_INTEGER)-(Number.isFinite(tb)?tb:Number.MAX_SAFE_INTEGER)})}
function slug(v:string){return cleanName(v).replace(/\s+/g,"-")}
export async function GET(){
  try{
    const markets: CfbMarketKey[]=CFB_MARKETS.map(x=>x[0]);
    const [schedule,q,modelPools]=await Promise.all([
      getEspnCfbSchedule(),
      getOwlsQualifiedGames(markets),
      Promise.all(markets.map(async market=>{
        try{return [market,await getCfbRankings(market)] as const}
        catch{return [market,[]] as const}
      })),
    ]);
    const sachByMatchup=new Map<string,{markets:CfbMarketKey[];players:Set<string>}>();
    for(const [market,rows] of modelPools){
      for(const row of rows as any[]){
        // Only advertise Sach-only availability when there is no sportsbook line.
        // These are verified ESPN schedule/roster/stat candidates, not invented props.
        if(row.marketBacked!==false||!row.matchup)continue;
        const k=cleanName(row.matchup);
        const cur=sachByMatchup.get(k)??{markets:[],players:new Set<string>()};
        if(!cur.markets.includes(market))cur.markets.push(market);
        if(row.playerName)cur.players.add(String(row.playerName));
        sachByMatchup.set(k,cur);
      }
    }
    const scheduleMap=new Map(schedule.map((g:any)=>[cleanName(`${g.awayTeam} @ ${g.homeTeam}`),g]));
    const merged:any[]=[];
    for(const item of q){
      const k=cleanName(item.matchup),espn=scheduleMap.get(k);
      if(espn){
        const sach=sachByMatchup.get(k);
        merged.push({...espn,matchup:item.matchup,availableProps:item.props,propQualified:true,sachProjectionMarkets:sach?.markets||[],sachProjectionCount:sach?.players.size||0});
        scheduleMap.delete(k);continue
      }
      const [awayTeam="Away",homeTeam="Home"]=item.matchup.split(" @ ");
      merged.push({id:item.eventId||`owls-${slug(item.matchup)}`,date:item.gameTime||"",awayTeam,homeTeam,awayTeamId:"",homeTeamId:"",awayLogo:"",homeLogo:"",awayScore:null,homeScore:null,awayRecord:"",homeRecord:"",status:"Scheduled",state:"pre",completed:false,venue:"",broadcasts:[],matchup:item.matchup,availableProps:item.props,propQualified:true,source:"owls"});
    }
    const remaining=[...scheduleMap.values()].map((g:any)=>{
      const matchup=`${g.awayTeam} @ ${g.homeTeam}`,sach=sachByMatchup.get(cleanName(matchup));
      return {...g,matchup,availableProps:[],propQualified:false,sachProjectionMarkets:sach?.markets||[],sachProjectionCount:sach?.players.size||0};
    });
    const games=merged.length?merged:remaining;
    return NextResponse.json({success:true,games:orderGames(games),qualifiedCount:merged.length,filterMode:merged.length?"prop_qualified":"schedule_fallback",updatedAt:new Date().toISOString()});
  }catch(e){return NextResponse.json({success:false,games:[],qualifiedCount:0,filterMode:"error",error:e instanceof Error?e.message:"CFB schedule unavailable"},{status:500})}
}
