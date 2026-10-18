import {NextRequest,NextResponse} from "next/server";
import {GET as gameSlate} from "../game-slate/route";
import {GET as nflRankings} from "../nfl/rankings/route";
import {GET as cfbRankings} from "../cfb/rankings-board/route";
import {GET as nbaRankings} from "../nba/rankings/route";
import {GET as wnbaRankings} from "../wnba/rankings/route";
import {GET as nhlRankings} from "../nhl/rankings/route";
import {GET as cbbRankings} from "../cbb/rankings/route";
import {GET as soccerRankings} from "../soccer/dashboard/route";
import {GET as mlbRankings} from "../mlb/rankings/route";
import {DASHBOARD_SPORTS,DEFAULT_MARKETS,dashboardCounts,type DashboardSport} from "@/lib/dashboard-contract";
export const dynamic="force-dynamic";
export const revalidate=0;
const handlers:Record<string,any>={nfl:nflRankings,cfb:cfbRankings,nba:nbaRankings,wnba:wnbaRankings,nhl:nhlRankings,cbb:cbbRankings,soccer:soccerRankings,mlb:mlbRankings};
const shared=globalThis as typeof globalThis&{__dashboardSummary?:Map<string,{expires:number,payload:any}>,__dashboardSummaryPending?:Map<string,Promise<any>>};
const cache=shared.__dashboardSummary??=new Map(),pending=shared.__dashboardSummaryPending??=new Map();
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get("sport") as DashboardSport,league=req.nextUrl.searchParams.get("league")||"eng.1";
 if(!DASHBOARD_SPORTS.includes(sport))return NextResponse.json({success:false,error:"Unsupported sport"},{status:400});
 const key=`${sport}|${sport==="soccer"?league:""}`,hit=cache.get(key);
 if(hit&&hit.expires>Date.now())return NextResponse.json(hit.payload,{headers:{"Cache-Control":"no-store"}});
 let work=pending.get(key);
 if(!work){
  work=(async()=>{
   const market=DEFAULT_MARKETS[sport],origin=req.nextUrl.origin;
   const [slateResult,rankResult]=await Promise.allSettled([
    gameSlate(new NextRequest(`${origin}/api/game-slate?sport=${sport}&league=${encodeURIComponent(league)}`)).then(r=>r.json()),
    handlers[sport](new NextRequest(`${origin}/api/${sport}/rankings?market=${market}&slate=all&league=${encodeURIComponent(league)}`)).then((r:Response)=>r.json())
   ]);
   const slate=slateResult.status==="fulfilled"?slateResult.value:{success:false,games:[],error:"Schedule unavailable"};
   const ranking=rankResult.status==="fulfilled"?rankResult.value:{success:false,rows:[],error:"Rankings unavailable"};
   const rows=sport==="soccer"?(ranking.rankings?.[market]||[]):sport==="mlb"?(ranking.batter?.[market]||[]):ranking.rows||[];
   const counts=dashboardCounts(slate.games||[],rows,sport==="cfb"||sport==="nfl");
   const payload={success:slate.success!==false,sport,league,market,scope:"Current slate · default ranking market",weekNumber:slate.weekNumber,...counts,previewGames:slate.games||[],scheduleAvailable:slate.success!==false,rankingsAvailable:ranking.success!==false,warning:[slate.error,ranking.error,ranking.warning].filter(Boolean).join(" · ")||null,updatedAt:new Date().toISOString()};
   // Failed feeds retry promptly and never become a durable fallback.
   cache.set(key,{expires:Date.now()+(payload.rankingsAvailable&&payload.scheduleAvailable?30_000:5_000),payload});
   return payload;
  })().finally(()=>pending.delete(key));pending.set(key,work);
 }
 return NextResponse.json(await work,{headers:{"Cache-Control":"no-store"}});
}
