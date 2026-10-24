import {NextRequest,NextResponse} from 'next/server';
import {VISIBLE_SPORTS,type DashboardSport} from '@/lib/dashboard-contract';
import {topPlayMarketState} from '@/lib/top-plays-store';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'';
 if(!VISIBLE_SPORTS.includes(sport as DashboardSport)||sport==='soccer')return NextResponse.json({error:'Unsupported sport'},{status:400});
 return NextResponse.json(topPlayMarketState(sport),{headers:{'Cache-Control':'no-store'}});
}
