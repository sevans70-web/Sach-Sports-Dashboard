import {todayTopPlays,selectFeaturedCandidates} from '@/lib/top-plays';
import {dashboardDay} from '@/lib/dashboard-contract';
/** Recover only choices supported by original pregame evidence, never outcomes. */
export function retainedTopPlays(boards:any[],sport:string,now=Date.now()){
 const priced:any[]=[],scorers:any[]=[],seen=new Set<string>();
 for(const board of boards)for(const row of board?.rows||[]){
  if(dashboardDay(row.gameTime)!==dashboardDay(new Date(now)))continue;
  const at=Date.parse(row.boardCapturedAt||row.researchForecast?.modelSelection?.calculatedAt||row.capturedAt||board.capturedAt||'');
  if(!Number.isFinite(at)||at>=Date.parse(row.gameTime)||at>now)continue;
  const candidates=todayTopPlays([{...row,market:row.market||board.market}],sport,at);
  for(const candidate of candidates){
   if(!candidate.pick)continue;
   const p=candidate.pick,key=[p.row.playerId,p.row.market,p.row.quoteId,at].join('|');
   if(seen.has(key))continue;seen.add(key);
   const pick={...p,row:{...p.row,featuredSavedAt:new Date(at).toISOString(),featuredRetained:true}};
   (p.basis==='model'?priced:scorers).push(pick);
  }
 }
 return selectFeaturedCandidates(priced,scorers,sport);
}

