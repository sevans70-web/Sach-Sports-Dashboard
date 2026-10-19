import {NextRequest,NextResponse} from 'next/server';
import {providerFetch} from '@/lib/provider-fetch';
import {nhlHistoryPoints} from '@/lib/nhl-history-points';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest,{params}:{params:Promise<{id:string}>}){
 const {id}=await params,market=req.nextUrl.searchParams.get('market')||'';
 if(!/^\d+$/.test(id)||!['points','goals','assists','shots_on_goal','blocked_shots','goalie_saves'].includes(market))return NextResponse.json({success:false,points:[],error:'Unsupported player or market'},{status:400});
 const now=new Date(),year=now.getUTCFullYear(),seasonStart=now.getUTCMonth()>=8?year:year-1;
 const blocks=await Promise.all([seasonStart-1,seasonStart].map(async start=>{
  try{const r=await providerFetch(`https://api-web.nhle.com/v1/player/${id}/game-log/${start}${start+1}/2`,{cache:'no-store'});if(!r.ok)return {ok:false,points:[]};return {ok:true,points:nhlHistoryPoints(await r.json(),market)}}catch{return {ok:false,points:[]}}
 }));
 const points=[...new Map(blocks.flatMap(b=>b.points).map(p=>[p.gameId,p])).values()].sort((a,b)=>a.date.localeCompare(b.date)).slice(-30);
 const success=blocks.some(b=>b.ok);
 return NextResponse.json({success,points,updatedAt:new Date().toISOString()},{status:success?200:502,headers:{'Cache-Control':'no-store'}});
}
