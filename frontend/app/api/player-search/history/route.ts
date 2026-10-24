import {NextRequest,NextResponse} from 'next/server';
import {providerFetch} from '@/lib/provider-fetch';
import {espnHockeyHistory} from '@/lib/search-player-history';
import {retainPlayerHistory} from '@/lib/player-history-cloud';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const id=req.nextUrl.searchParams.get('id')||'',market=req.nextUrl.searchParams.get('market')||'shots_on_goal';
 if(!/^\d{1,12}$/.test(id)||!['shots_on_goal','points','goals','assists','goalie_saves','blocked_shots'].includes(market))return NextResponse.json({success:false,points:[]},{status:400});
 const year=new Date().getUTCFullYear()+(new Date().getUTCMonth()>=8?1:0);
 const blocks=await Promise.all([year-1,year].map(async season=>{try{const r=await providerFetch(`https://site.web.api.espn.com/apis/common/v3/sports/hockey/nhl/athletes/${id}/gamelog?season=${season}`);if(!r.ok)throw Error();return {ok:true,points:espnHockeyHistory(await r.json(),market)};}catch{return {ok:false,points:[]};}}));
 const points=[...new Map(blocks.flatMap(b=>b.points).map(p=>[p.gameId,p])).values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-20);
 const success=blocks.some(b=>b.ok),response=NextResponse.json({success,points,statLabel:market.replaceAll('_',' ')},{status:success?200:502});
 return retainPlayerHistory('nhl',`espn:${id}`,market,response,null);
}
