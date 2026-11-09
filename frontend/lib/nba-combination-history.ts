import type {OpportunityGame} from '@/lib/opportunity-backtest';

export const NBA_COMBINATION_MARKETS:Record<string,readonly string[]>={
 pts_rebs_asts:['points','rebounds','assists'],
 pts_rebs:['points','rebounds'],
 pts_asts:['points','assists'],
 rebs_asts:['rebounds','assists'],
};

/** Model the actual sum for each player and fixture so the components'
 * dependence is preserved in both fitting and probability calibration. */
export function nbaCombinationHistory(games:OpportunityGame[],market:string){
 const components=NBA_COMBINATION_MARKETS[market];
 if(!components)return [];
 const fixtures=new Map<string,Map<string,OpportunityGame>>();
 for(const game of games){
  if(game.sport!=='nba'||!components.includes(game.market))continue;
  const key=[game.gameId,game.playerId,game.teamId,game.season,game.gameTime].join('|');
  const rows=fixtures.get(key)??new Map<string,OpportunityGame>();
  rows.set(game.market,game);
  fixtures.set(key,rows);
 }
 return [...fixtures.values()].flatMap(rows=>{
  const first=rows.get(components[0]);
  const context=first?.basketballContext;
  if(!first||!context||components.some(key=>{
   const row=rows.get(key);
   return !row||!Number.isFinite(row.actual)||row.workload!==first.workload||row.opponentId!==first.opponentId||!Number.isFinite(context.allowed[key]);
  }))return [];
  const actual=components.reduce((sum,key)=>sum+rows.get(key)!.actual,0);
  const allowed=components.reduce((sum,key)=>sum+context.allowed[key],0);
  return [{...first,market,actual,basketballContext:{...context,allowed:{...context.allowed,[market]:allowed}}}];
 });
}
