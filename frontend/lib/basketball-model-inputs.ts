import type {OpportunityGame} from '@/lib/opportunity-backtest';
type Target=Omit<OpportunityGame,'actual'|'workload'>;
const average=(xs:number[])=>xs.reduce((a,b)=>a+b,0)/xs.length;
const key=(g:Pick<OpportunityGame,'sport'|'market'|'teamId'>)=>[g.sport,g.market,g.teamId].join('|');
/** An immutable fixture census index; opponent features use entire prior team
 * games, not the handful of current players selected for the rankings board. */
export function basketballFeatureIndex(games:OpportunityGame[]){
 const players=new Map<string,OpportunityGame[]>(),teams=new Map<string,Map<string,OpportunityGame>>();
 for(const g of games){if(!g.basketballContext)continue;
  const pk=key(g)+'|'+g.playerId;players.set(pk,[...(players.get(pk)||[]),g]);
  const tk=key(g),fixtures=teams.get(tk)||new Map<string,OpportunityGame>();
  const previous=fixtures.get(g.gameId);
  if(previous&&JSON.stringify({allowed:previous.basketballContext!.allowed,possessions:previous.basketballContext!.teamPossessions})!==JSON.stringify({allowed:g.basketballContext.allowed,possessions:g.basketballContext.teamPossessions}))throw Error('Conflicting basketball team context '+g.gameId);
  fixtures.set(g.gameId,g);teams.set(tk,fixtures);
 }
 for(const rows of players.values())rows.sort((a,b)=>a.gameTime.localeCompare(b.gameTime));
 const teamRows=new Map([...teams].map(([k,fixtures])=>[k,[...fixtures.values()].sort((a,b)=>a.gameTime.localeCompare(b.gameTime))]));
 return (target:Target,availableAt=target.gameTime)=>{
  const at=Date.parse(availableAt),start=Date.parse(target.gameTime),cutoff=at-48*3600000;
  if(!Number.isFinite(at)||!Number.isFinite(start)||at>start||typeof target.basketballContext?.home!=='boolean')return {features:null,baseline:null,reason:'missing_pregame_fixture_context'};
  const eligible=(g:OpportunityGame)=>Date.parse(g.gameTime)<cutoff&&Date.parse(g.gameTime)>start-366*86400000&&Number(g.season)<=Number(target.season)&&Number(g.season)>=Number(target.season)-1;
  const prior=(players.get(key(target)+'|'+target.playerId)||[]).filter(eligible).slice(-10);
  if(prior.length<5||prior.filter(g=>g.workload>0).length<3)return {features:null,baseline:null,reason:'insufficient_basketball_role_history'};
  const own=(teamRows.get(key(target))||[]).filter(eligible).slice(-10);
  const opponent=(teamRows.get(key({...target,teamId:target.opponentId}))||[]).filter(eligible).slice(-10);
  if(own.length<5||opponent.length<5)return {features:null,baseline:null,reason:'insufficient_opponent_team_history'};
  const recent=prior.slice(-3),last=prior.at(-1)!,volume=(rows:OpportunityGame[])=>average(rows.map(g=>g.workload));
  const rate=(rows:OpportunityGame[])=>rows.reduce((n,g)=>n+g.actual,0)/rows.reduce((n,g)=>n+g.workload,0);
  const usage=(rows:OpportunityGame[])=>rows.reduce((n,g)=>n+(g.basketballContext!.usage??0)*g.workload,0)/rows.reduce((n,g)=>n+g.workload,0);
  const starter=(rows:OpportunityGame[])=>average(rows.map(g=>g.basketballContext!.starter===true?1:0));
  const min3=volume(recent),min10=volume(prior);
  if(min3<=0||min10<=0||last.workload<min3*.4)return {features:null,baseline:null,reason:'prior_basketball_role_uncertain'};
  if(prior.some(g=>g.basketballContext!.starter==null||g.workload>0&&g.basketballContext!.usage==null))return {features:null,baseline:null,reason:'missing_prior_usage_or_role'};
  const attempts=(field:'fieldGoalAttempts'|'freeThrowAttempts'|'turnovers')=>recent.reduce((n,g)=>n+g.basketballContext![field],0)/recent.reduce((n,g)=>n+g.workload,0);
  const pace=(rows:OpportunityGame[])=>average(rows.map(g=>g.basketballContext!.teamPossessions/g.basketballContext!.duration*48));
  const allowed=(rows:OpportunityGame[])=>average(rows.map(g=>100*g.basketballContext!.allowed[target.market]/g.basketballContext!.teamPossessions));
  const scheduled=(teamRows.get(key(target))||[]).filter(g=>Date.parse(g.gameTime)<at).at(-1);
  const rest=scheduled?Math.min(14,(start-Date.parse(scheduled.gameTime))/86400000):14;
  const features=[min3,min10,last.workload,Math.sqrt(average(prior.map(g=>(g.workload-min10)**2))),starter(recent),starter(prior),last.basketballContext!.starter===true?1:0,
   usage(recent),usage(prior),attempts('fieldGoalAttempts'),attempts('freeThrowAttempts'),attempts('turnovers'),rate(recent),rate(prior),average(recent.map(g=>g.actual)),average(prior.map(g=>g.actual)),
   pace(own),pace(opponent),allowed(opponent),allowed(opponent.slice(-3)),target.basketballContext.home?1:0,rest,rest<1.3?1:0,Number(last.season!==target.season)];
  if(!features.every(Number.isFinite))return {features:null,baseline:null,reason:'invalid_basketball_context'};
  const baseline=prior.reduce((n,g,i)=>n+g.actual*(i+1),0)/prior.reduce((n,_,i)=>n+i+1,0);
  return {features,baseline,reason:null};
 };
}
