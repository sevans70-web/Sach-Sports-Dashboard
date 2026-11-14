import {dashboardDay} from '@/lib/dashboard-contract';
/** Sum only observed market/date coverage in the selected official fixtures.
 * Partial coverage is a labelled lower bound, never a certified zero. */
export function rankingScopeSummary(games:any[],markets:string[],coverages:any[],now=Date.now()){
 const fixtures=new Map(games.map(g=>[String(g.id||g.gameId),g]));
 const days=[...new Set(games.map(g=>dashboardDay(g.date||g.tipoff||'')).filter(Boolean))];
 const latest=new Map<string,any>();
 for(const c of coverages){
  if(!markets.includes(c?.market)||!days.includes(c.day)||!Array.isArray(c.games)||!Number.isFinite(c.checkedAt)||c.checkedAt>now||now-c.checkedAt>=15*60_000)continue;
  // Aggregated pregame counts cannot be carried through a kickoff unchecked.
  if(c.games.some((g:any)=>{const start=Date.parse(fixtures.get(String(g.gameId))?.date||'');return c.checkedAt<start&&start<=now;}))continue;
  if(c.games.some((g:any)=>!['rows','lines','projections','picks','ev'].every(k=>Number.isInteger(g[k])&&g[k]>=0)))continue;
  const key=c.day+'|'+c.market;if(!latest.has(key)||latest.get(key).checkedAt<c.checkedAt)latest.set(key,c);
 }
 const missing=days.flatMap(day=>markets.filter(m=>!latest.has(day+'|'+m)).map(m=>({day,market:m})));
 const marketCounts=markets.map(market=>{
  const seen=new Set<string>();const sum={market,rankings:0,lines:0,projections:0,picks:0,ev:0};
  for(const day of days)for(const g of latest.get(day+'|'+market)?.games||[]){
   const game=fixtures.get(String(g.gameId));if(!game||seen.has(String(g.gameId))||dashboardDay(game.date||game.tipoff||'')!==day)continue;
   seen.add(String(g.gameId));sum.rankings+=g.rows;sum.lines+=g.lines;sum.projections+=g.projections;sum.picks+=g.picks;sum.ev+=g.ev;
  }
  return sum;
 });
 const complete=missing.length===0,observed=latest.size,available=!games.length||observed>0;
 const totals=marketCounts.reduce((s,c)=>({lines:s.lines+c.lines,picks:s.picks+c.picks}),{lines:0,picks:0});
 return {marketCounts,coverageComplete:complete,rankingsAvailable:available,playerProps:available?totals.lines:null,estimatedPicks:available?totals.picks:null,marketsCounted:new Set([...latest.values()].map(c=>c.market)).size,
  coverageAudit:{expectedMarkets:markets.length,observedMarkets:new Set([...latest.values()].map(c=>c.market)).size,expectedMarketDates:days.length*markets.length,observedMarketDates:observed,missingMarketDates:missing,missingMarkets:markets.filter(m=>days.some(day=>!latest.has(day+'|'+m))),complete,selectedPicks:available?totals.picks:null}};
}
