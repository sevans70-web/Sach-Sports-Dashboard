import {todayTopPlays} from '@/lib/top-plays';
import {dashboardDay} from '@/lib/dashboard-contract';
/** Recover only choices supported by original pregame evidence, never outcomes. */
export function retainedTopPlays(boards:any[],sport:string,now=Date.now()){
 const cards=todayTopPlays([],sport,now);
 for(const board of boards)for(const row of board?.rows||[]){
  if(dashboardDay(row.gameTime)!==dashboardDay(new Date(now)))continue;
  const at=Date.parse(row.boardCapturedAt||row.researchForecast?.modelSelection?.calculatedAt||row.capturedAt||board.capturedAt||'');
  if(!Number.isFinite(at)||at>=Date.parse(row.gameTime)||at>now)continue;
  const candidates=todayTopPlays([{...row,market:row.market||board.market}],sport,at);
  for(const candidate of candidates){
   if(!candidate.pick)continue;
   const target=cards.find(c=>c.key===candidate.key)!;
   const score=(p:any)=>candidate.key==='value'||candidate.key==='long'&&p.basis==='model'?p.expectedReturn:p.probability;
   if(!target.pick||candidate.key==='long'&&candidate.pick.basis==='model'&&target.pick.basis!=='model'||score(candidate.pick)>score(target.pick))target.pick={...candidate.pick,row:{...candidate.pick.row,featuredSavedAt:new Date(at).toISOString(),featuredRetained:true}};
  }
 }
 return cards;
}
