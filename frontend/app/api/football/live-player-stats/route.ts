import {NextRequest,NextResponse} from 'next/server';
import {providerFetch} from '@/lib/provider-fetch';
import {espnParticipation} from '@/lib/player-participation';
import {footballObservedRows} from '@/lib/football-observed-stats';
export const dynamic='force-dynamic';
export const revalidate=0;
const paths:Record<string,string>={nfl:'nfl',cfb:'college-football'};
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'',gameId=req.nextUrl.searchParams.get('gameId')||'';
 if(!paths[sport]||!/^\d+$/.test(gameId))return NextResponse.json({success:false,participants:[],error:'Valid football sport and official gameId required'},{status:400});
 try{
  const response=await providerFetch(`https://site.api.espn.com/apis/site/v2/sports/football/${paths[sport]}/summary?event=${gameId}`,{cache:'no-store'});
  if(!response.ok)throw Error(`Official boxscore unavailable (${response.status})`);
  const payload=await response.json();if(String(payload?.header?.id||'')!==gameId)throw Error('Football boxscore game identity mismatch');
  const state=payload.header?.competitions?.[0]?.status?.type?.state||'pre';
  return NextResponse.json({success:true,sport,gameId,state,rows:footballObservedRows(payload),participants:espnParticipation(payload,sport),updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({success:false,participants:[],gameId,error:e instanceof Error?e.message:'Participation unavailable'},{status:502,headers:{'Cache-Control':'no-store'}})}
}
