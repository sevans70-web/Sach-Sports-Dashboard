import type {OpportunityGame} from '@/lib/opportunity-backtest';
import {probabilityInputs} from '@/lib/probability-forecast';

type Target=Omit<OpportunityGame,'actual'|'workload'>;
const average=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const group=(g:Pick<OpportunityGame,'sport'|'market'|'season'>)=>[g.sport,g.market,g.season].join('|');
type TeamGame={gameId:string;gameTime:string;teamId:string;opponentId:string;actual:number;workload:number};

/** Research-only context from reported player totals in a completed-game
 * population. These are not official team/net-yardage statistics. Neither a
 * current roster nor the target fixture's realized results can supply context. */
export function footballMatchupIndex(games:OpportunityGame[]){
 const players=new Map<string,OpportunityGame[]>(),fixtures=new Map<string,Map<string,TeamGame>>();
 const seen=new Set<string>();
 for(const g of games){
  if(!['nfl','cfb'].includes(g.sport)||!['passing_yards','rushing_yards','receiving_yards','receptions'].includes(g.market))continue;
  if(!g.gameId||!g.playerId||!g.teamId||!g.opponentId||g.teamId===g.opponentId||!Number.isFinite(Date.parse(g.gameTime))||!Number.isFinite(g.actual)||!Number.isFinite(g.workload)||g.workload<0)throw Error('Invalid football context observation');
  const identity=[group(g),g.gameId,g.playerId].join('|');if(seen.has(identity))throw Error('Duplicate football context observation');seen.add(identity);
  const pk=group(g)+'|'+g.teamId+'|'+g.playerId;let history=players.get(pk);if(!history){history=[];players.set(pk,history)}history.push(g);
  const fk=group(g)+'|'+g.gameId;let teams=fixtures.get(fk);if(!teams){teams=new Map();fixtures.set(fk,teams)}
  const total=teams.get(g.teamId)||{gameId:g.gameId,gameTime:g.gameTime,teamId:g.teamId,opponentId:g.opponentId,actual:0,workload:0};
  if(total.opponentId!==g.opponentId||total.gameTime!==g.gameTime)throw Error('Conflicting football fixture context');
  total.actual+=g.actual;total.workload+=g.workload;teams.set(g.teamId,total);
 }
 const offense=new Map<string,TeamGame[]>(),allowed=new Map<string,TeamGame[]>();
 for(const [fk,teams] of fixtures){
  // A partial one-team fixture cannot establish defensive context. Positive
  // player workloads are reported-source totals, not a completeness guarantee.
  if(teams.size!==2)continue;
  const [a,b]=[...teams.values()];if(a.opponentId!==b.teamId||b.opponentId!==a.teamId||a.gameTime!==b.gameTime)throw Error('Conflicting football opponents');
  const prefix=fk.slice(0,fk.lastIndexOf('|'));
  for(const row of [a,b])for(const [index,team] of [[offense,row.teamId],[allowed,row.opponentId]] as const){
   const key=prefix+'|'+team,rows=index.get(key)||[];rows.push(row);index.set(key,rows);
  }
 }
 for(const index of [players,offense,allowed])for(const rows of index.values())rows.sort((a,b)=>a.gameTime.localeCompare(b.gameTime)||a.gameId.localeCompare(b.gameId));
 return (target:Target,availableAt=target.gameTime)=>{
  const at=Date.parse(availableAt),start=Date.parse(target.gameTime),cutoff=at-48*3600000;
  if(!Number.isFinite(at)||!Number.isFinite(start)||at>start||!target.opponentId||target.teamId===target.opponentId)return {features:null,baseline:null,reason:'missing_football_fixture_context'};
  const history=players.get(group(target)+'|'+target.teamId+'|'+target.playerId)||[];
  const base=probabilityInputs(history,target,availableAt);if(!base.features)return base;
  const eligible=(r:TeamGame)=>r.gameId!==target.gameId&&Date.parse(r.gameTime)<cutoff;
  const own=(offense.get(group(target)+'|'+target.teamId)||[]).filter(eligible).slice(-5);
  const opponent=(allowed.get(group(target)+'|'+target.opponentId)||[]).filter(eligible).slice(-5);
  if(own.length<3||opponent.length<3)return {features:null,baseline:null,reason:'insufficient_prior_football_team_context'};
  const context=(rows:TeamGame[])=>[average(rows.map(r=>r.actual)),average(rows.map(r=>r.workload)),rows.reduce((n,r)=>n+r.actual,0)/rows.reduce((n,r)=>n+r.workload,0)];
  const features=[...base.features,...context(own),...context(opponent)];
  if(!features.every(Number.isFinite))return {features:null,baseline:null,reason:'invalid_football_team_context'};
  return {features,baseline:base.baseline,reason:null};
 };
}
