import {NextRequest,NextResponse} from 'next/server';
import {DASHBOARD_SPORTS,type DashboardSport} from '@/lib/dashboard-contract';
import {readDurableHistoryBatch} from '@/lib/durable-history';
import {dashboardDay} from '@/lib/dashboard-contract';
import {updateTopPlayMarket} from '@/lib/top-plays-store';
import {topPlayMarketState} from '@/lib/top-plays-store';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'';
 if(!DASHBOARD_SPORTS.includes(sport as DashboardSport))return NextResponse.json({error:'Unsupported sport'},{status:400});
 const day=dashboardDay(new Date());
 const markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts','rebs_asts','steals','blocks','first_basket','passing_yards','passing_tds','pass_completions','qb_rushing_yards','rushing_yards','receiving_yards','receptions','anytime_td','first_td','shots_on_goal','goals','blocked_shots','goalie_saves','home_runs','hits','strikeouts'];
 const saved=await readDurableHistoryBatch(sport,markets.map(m=>'featured_'+m),day).catch(()=>[]);
 for(const record of saved){const board=record.payload?.[0],stamp=Date.parse(board?.featuredCapturedAt||'');if(board&&Number.isFinite(stamp)&&Date.now()-stamp<15*60000)updateTopPlayMarket(sport,board,stamp);}
 return NextResponse.json(topPlayMarketState(sport),{headers:{'Cache-Control':'no-store'}});
}
