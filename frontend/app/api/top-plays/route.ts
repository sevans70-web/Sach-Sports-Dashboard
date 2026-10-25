import {NBA_MARKETS} from '@/lib/nba';
import {NFL_MARKETS} from '@/lib/nfl';
import {CFB_MARKETS} from '@/lib/cfb';
import {NHL_MARKETS} from '@/lib/nhl';
import {CBB_MARKETS} from '@/lib/cbb';
import {WNBA_MARKETS} from '@/lib/wnba';
import {SOCCER_MARKETS} from '@/lib/soccer';
import {BATTER_MARKETS,PITCHER_MARKETS} from '@/lib/mlb';
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
 const definitions:Record<string,readonly (readonly any[])[]>={nba:NBA_MARKETS,nfl:NFL_MARKETS,cfb:CFB_MARKETS,nhl:NHL_MARKETS,cbb:CBB_MARKETS,wnba:WNBA_MARKETS,soccer:SOCCER_MARKETS,mlb:[...BATTER_MARKETS,...PITCHER_MARKETS]};
 const markets=[...new Set(definitions[sport].map(m=>String(m[0])))];
 const saved=await readDurableHistoryBatch(sport,markets.map(m=>'featured_'+m),day).catch(()=>[]);
 for(const record of saved){const board=record.payload?.[0],stamp=Date.parse(board?.featuredCapturedAt||'');if(board&&Number.isFinite(stamp)&&Date.now()-stamp<15*60000)updateTopPlayMarket(sport,board,stamp);}
 return NextResponse.json(topPlayMarketState(sport),{headers:{'Cache-Control':'no-store'}});
}
