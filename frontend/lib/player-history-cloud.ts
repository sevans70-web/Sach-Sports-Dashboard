import {appendHistorySnapshot} from '@/lib/history-archive';
import {after,NextResponse} from 'next/server';
import {cloudConfigured,cloudRequest} from '../scripts/history-cloud.mjs';
import {playerGameObservations} from '@/lib/player-game-observations';
export async function retainPlayerHistory(sport:string,id:string,market:string,response:Response,before?:string|null){
 if(response.status===400)return response;
 const data=await response.clone().json().catch(()=>null);if(!data||data.supported===false)return response;
 const points=Array.isArray(data.points)?data.points:[];
 if(points.length){
  const observations=playerGameObservations(sport,id,market,points);
  try{await appendHistorySnapshot(sport,'player_history_'+id+'_'+market,{kind:'official_player_history',playerId:id,market,points});}catch(e){console.warn('[player-history local archive]',sport,market,e instanceof Error?e.message:'write failed');}
  if(cloudConfigured()&&observations.length)after(async()=>{try{for(let i=0;i<observations.length;i+=100)await cloudRequest('history_player_games?on_conflict=sport,player_id,game_id,market',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(observations.slice(i,i+100))});}catch(e){console.warn('[player-history cloud]',sport,market,e instanceof Error?e.message:'write failed');}});
  return response;
 }
 if(!cloudConfigured())return response;
 try{
  const cutoff=before&&Number.isFinite(Date.parse(before))?`&game_time=lt.${encodeURIComponent(new Date(before).toISOString())}`:'';
  const saved=await cloudRequest(`history_player_games?select=point&sport=eq.${encodeURIComponent(sport)}&player_id=eq.${encodeURIComponent(id)}&market=eq.${encodeURIComponent(market)}${cutoff}&order=game_time.desc&limit=30`,{signal:AbortSignal.timeout(2500)});
  if(saved.length)return NextResponse.json({...data,success:true,supported:true,points:saved.map((r:any)=>r.point).reverse(),message:'',historySource:'saved_official_game_logs'},{headers:{'Cache-Control':'no-store'}});
 }catch{}
 return response;
}
