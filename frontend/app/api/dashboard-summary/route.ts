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
import {DASHBOARD_SPORTS,DEFAULT_MARKETS,VISIBLE_SPORTS,dashboardCounts,dashboardDay,dashboardToday,type DashboardSport} from "@/lib/dashboard-contract";
import {NBA_MARKETS} from "@/lib/nba";
import {NFL_ACTIVE_MARKETS} from "@/lib/nfl";
import {NHL_MARKETS} from "@/lib/nhl";
import {readDurableHistoryBatch} from "@/lib/durable-history";
export const dynamic="force-dynamic";
export const revalidate=0;
const handlers:Record<string,any>={nfl:nflRankings,cfb:cfbRankings,nba:nbaRankings,wnba:wnbaRankings,nhl:nhlRankings,cbb:cbbRankings,soccer:soccerRankings,mlb:mlbRankings};
const homeMarkets={nba:NBA_MARKETS,nfl:NFL_ACTIVE_MARKETS,nhl:NHL_MARKETS};
const shared=globalThis as typeof globalThis&{__dashboardSummary?:Map<string,{expires:number,payload:any}>,__dashboardSummaryPending?:Map<string,Promise<any>>};
const cache=shared.__dashboardSummary??=new Map(),pending=shared.__dashboardSummaryPending??=new Map();
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get("sport") as DashboardSport,league=req.nextUrl.searchParams.get("league")||"eng.1";
 if(!DASHBOARD_SPORTS.includes(sport))return NextResponse.json({success:false,error:"Unsupported sport"},{status:400});
 const now=new Date(),day=dashboardDay(now);
 const todayOnly=req.nextUrl.searchParams.get("scope")==="today"&&VISIBLE_SPORTS.includes(sport);
 const key=`${sport}|${sport==="soccer"?league:""}${todayOnly?"|today":""}`,hit=cache.get(key);
 if(hit&&hit.expires>Date.now()&&(!todayOnly||hit.payload.slateDay===day))return NextResponse.json(hit.payload,{headers:{"Cache-Control":"no-store"}});
 const pendingKey=todayOnly?`${key}|${day}`:key;
 let work=pending.get(pendingKey);
 if(!work){
  work=(async()=>{
   const market=DEFAULT_MARKETS[sport],origin=req.nextUrl.origin;
   const streams=todayOnly?homeMarkets[sport as keyof typeof homeMarkets].map(([market])=>"featured_"+market):[];
   const [slateResult,rankResult,savedResult]=await Promise.allSettled([
    gameSlate(new NextRequest(`${origin}/api/game-slate?sport=${sport}&league=${encodeURIComponent(league)}`)).then(r=>r.json()),
    handlers[sport](new NextRequest(`${origin}/api/${sport}/rankings?market=${market}&slate=${todayOnly?"today":"all"}&league=${encodeURIComponent(league)}`)).then((r:Response)=>r.json()),
    todayOnly?readDurableHistoryBatch(sport,streams,day,{requireComplete:true}):Promise.resolve([])
   ]);
   const slate=slateResult.status==="fulfilled"?slateResult.value:{success:false,games:[],error:"Schedule unavailable"};
   const ranking=rankResult.status==="fulfilled"?rankResult.value:{success:false,rows:[],error:"Rankings unavailable"};
   const rows=sport==="soccer"?(ranking.rankings?.[market]||[]):sport==="mlb"?(ranking.batter?.[market]||[]):ranking.rows||[];
   const games=todayOnly?dashboardToday(slate.games||[],now):slate.games||[];
   const savedBoards=savedResult.status==="fulfilled"?savedResult.value:[];
   const marketRows=new Map<string,any[]>();
   for(const document of savedBoards){
    const board=document.payload?.[0];
    if(!board?.market||!Array.isArray(board.rows)||board.success===false)continue;
    marketRows.set(board.market,board.rows.map((row:any)=>({...row,market:board.market})));
   }
   if(todayOnly&&ranking.success!==false){
    const current=rows.filter((row:any)=>dashboardDay(row.gameTime)===day);
    if(current.length||!marketRows.has(market)){
     const refreshed=new Set(current.map((row:any)=>String(row.gameId)));
     const saved=(marketRows.get(market)||[]).filter(row=>!refreshed.has(String(row.gameId)));
     marketRows.set(market,[...saved,...current.map((row:any)=>({...row,market}))]);
    }
   }
   const countRows=todayOnly?[...marketRows.values()].flat().filter(row=>row.gameId&&dashboardDay(row.gameTime)===day):rows;
   const counts=dashboardCounts(games,countRows,sport==="cfb"||sport==="nfl");
   const scheduleAvailable=slate.success!==false;
   const rankingsAvailable=todayOnly?scheduleAvailable&&(!games.length||savedResult.status==="fulfilled"&&marketRows.size>0):ranking.success!==false;
   const payload={success:scheduleAvailable,sport,league,market,scope:todayOnly?"Today · saved ranking markets":"Current slate · default ranking market",
    ...(todayOnly?{slateDay:day,marketsCounted:marketRows.size}:{}),weekNumber:slate.weekNumber,...counts,previewGames:games,scheduleAvailable,rankingsAvailable,
    warning:[slate.error,ranking.error,ranking.warning].filter(Boolean).join(" · ")||null,updatedAt:new Date().toISOString()};
   // Failed feeds retry promptly and never become a durable fallback.
   cache.set(key,{expires:Date.now()+(payload.rankingsAvailable&&payload.scheduleAvailable?30_000:5_000),payload});
   return payload;
  })().finally(()=>pending.delete(pendingKey));pending.set(pendingKey,work);
 }
 return NextResponse.json(await work,{headers:{"Cache-Control":"no-store"}});
}
