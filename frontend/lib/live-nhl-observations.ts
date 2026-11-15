import {providerFetch} from '@/lib/provider-fetch';
import {verifiedPropQuote} from '@/lib/prop-integrity';
import {nhlOpportunityGames,type OpportunityGame} from '@/lib/opportunity-backtest';
/** One total deadline, not eight seconds multiplied by every player batch.
 * Only upcoming exact-priced cards need fresh history; never refit saved games. */
export async function refreshNhlObservations(rows:any[],now=Date.now(),read=providerFetch,budgetMs=8000){
 const players=[...new Map(rows.filter(r=>/^\d+$/.test(String(r.playerId))&&Date.parse(r.gameTime)>now&&!r.boardFrozen&&!r.frozen&&!r.lockedAtKickoff&&verifiedPropQuote(r,now)).map(r=>[String(r.playerId),r])).values()];
 const signal=AbortSignal.timeout(budgetMs),observations:OpportunityGame[]=[],unavailablePlayers=new Set<string>();
 for(let i=0;i<players.length;i+=4){
  if(signal.aborted){for(const r of players.slice(i))unavailablePlayers.add(String(r.playerId));break;}
  await Promise.all(players.slice(i,i+4).map(async row=>{
   const playerId=String(row.playerId),season=String(row.season),url=`https://api-web.nhle.com/v1/player/${encodeURIComponent(playerId)}/game-log/${encodeURIComponent(season)}/2`;
   try{const response=await read(url,{signal});if(!response.ok)throw Error('official_history_unavailable');const payload=await response.json();if(!Array.isArray(payload.gameLog))throw Error('official_history_unavailable');observations.push(...nhlOpportunityGames(payload,{sport:'nhl',season,playerId,playerName:row.playerName,source:url,retrievedAt:new Date(now).toISOString()}));}
   catch{unavailablePlayers.add(playerId);}
  }));
 }
 return {observations,unavailablePlayers:[...unavailablePlayers],requestedPlayers:players.length,budgetExceeded:signal.aborted};
}
