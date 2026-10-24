import {hiddenGameObservations} from '@/lib/hidden-game-observations';
import {cloudConfigured,cloudRequest} from '../scripts/history-cloud.mjs';
import {providerFetch as fetch} from '@/lib/provider-fetch';
import {appendHistorySnapshot,torontoHistoryDay} from '@/lib/history-archive';
/** Capture complete official game evidence even when no user opens a hidden dashboard.
 * These observations never create, reconstruct or grade a saved betting call. */
export async function captureHiddenSportGames(sport:'wnba'|'mlb',now=new Date()){
 const results:{gameId:string;ok:boolean}[]=[],errors:string[]=[];
 for(let offset=0;offset<3;offset++){
  const day=torontoHistoryDay(new Date(+now-offset*86400000));
  try{
   const url=sport==='wnba'?`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/scoreboard?dates=${day.replaceAll('-','')}&limit=100`:`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${day}`;
   const response=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
   if(!response.ok)throw new Error(`Schedule HTTP ${response.status}`);
   const schedule=await response.json();
   const games=sport==='wnba'?(schedule.events||[]).filter((g:any)=>g.status?.type?.completed===true):(schedule.dates||[]).flatMap((d:any)=>d.games||[]).filter((g:any)=>g.status?.abstractGameState==='Final');
   // Small batches bound provider load; all completed games are included, regardless of picks or view counts.
   for(let i=0;i<games.length;i+=2)await Promise.all(games.slice(i,i+2).map(async(g:any)=>{
    const id=String(sport==='wnba'?g.id:g.gamePk);
    try{
     const box=await fetch(sport==='wnba'?`https://site.api.espn.com/apis/site/v2/sports/basketball/wnba/summary?event=${encodeURIComponent(id)}`:`https://statsapi.mlb.com/api/v1/game/${encodeURIComponent(id)}/boxscore`,{cache:'no-store',signal:AbortSignal.timeout(10000)});
     if(!box.ok)throw new Error(`Boxscore HTTP ${box.status}`);
     const payload=await box.json();
     if(sport==='wnba'?!payload.boxscore?.players?.length:!payload.teams?.home?.players||!payload.teams?.away?.players)throw new Error('Incomplete official boxscore');
     await appendHistorySnapshot(sport,`official_game_${id}`,{kind:'official_final_game',gameId:id,gameDate:day,source:sport==='wnba'?'ESPN':'MLB Stats API',schedule:g,boxscore:payload},day);
     if(cloudConfigured()){
      const observations=hiddenGameObservations(sport,id,g,payload);
      for(let j=0;j<observations.length;j+=100)await cloudRequest('history_player_games?on_conflict=sport,player_id,game_id,market',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(observations.slice(j,j+100))});
     }
     results.push({gameId:id,ok:true});
    }catch{results.push({gameId:id,ok:false});}
   }));
  }catch(e){errors.push(`${day}: ${e instanceof Error?e.message:'schedule unavailable'}`);}
 }
 return {success:errors.length===0&&results.every(r=>r.ok),games:results.length,saved:results.filter(r=>r.ok).length,errors};
}
