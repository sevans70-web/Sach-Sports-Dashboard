import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {gunzipSync} from 'node:zlib';import {loadTs} from './load-ts.mjs';
const {nflRankingDisplay}=await loadTs(new URL('../lib/nfl-ranking-display.ts',import.meta.url));
const {NFL_ACTIVE_MARKETS}=await loadTs(new URL('../lib/nfl.ts',import.meta.url));
const {completeRankingProp}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
const {rankingRowIsPick}=await loadTs(new URL('../lib/ranking-pick-count.ts',import.meta.url));
const data=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/nfl-live-2026-11-15.json.gz',import.meta.url)))),now=Date.parse(data.recordedAt);
test('recorded live NFL QB disappearance is reproduced and quote-backed coverage restored without manufacturing selections',()=>{
 const expected={sacks:24,tackles:25,tackles_assists:25,passing_yards:16,passing_tds:16,passing_interceptions:16,qb_rushing_yards:16,passing_rushing_yards:16,rushing_yards:25,receiving_yards:25,receptions:25,rushing_receiving_yards:21,anytime_td:25,first_td:25,q1_passing_yards:16,q1_receiving_yards:25,q1_rushing_yards:25};
 assert.deepEqual(NFL_ACTIVE_MARKETS.map(([key])=>key).sort(),Object.keys(expected).sort());
 for(const [market,count] of Object.entries(expected)){
  const {rows}=data[market], original=JSON.stringify(rows);
  assert.equal(rows.filter(row=>completeRankingProp(row,now)).length,0,market+' old filter');
  const visible=rows.map(row=>nflRankingDisplay(row,now)).filter(Boolean);
  assert.equal(visible.length,count,market);
  assert.ok(visible.every(evidence=>evidence.ev.status==='unavailable'));
  assert.equal(rows.filter(row=>rankingRowIsPick(row,now)).length,0);
  assert.equal(JSON.stringify(rows),original);
 }
});
test('model validation failures remain unavailable confidence/EV; baselines and unmodelled quarters stay distinct',()=>{
 const failed=nflRankingDisplay(data.passing_yards.rows[0],now);assert.equal(failed.projection,231.4);assert.equal(failed.confidence,null);assert.equal(failed.ev.status,'unavailable');assert.match(failed.reason,/accuracy/);
 const baseline=nflRankingDisplay(data.passing_tds.rows[0],now);assert.equal(baseline.projection,null);assert.equal(baseline.baseline,.6);assert.equal(baseline.projectionLabel,'Historical baseline');assert.match(baseline.reason,/fitted/);
 const quarter=nflRankingDisplay(data.q1_passing_yards.rows[0],now);assert.equal(quarter.projection,null);assert.equal(quarter.baseline,null);assert.match(quarter.reason,/five verified quarter/);
 for(const m of ['q1_receptions','q1_qb_rushing_yards','q1_pass_attempts','q1_pass_completions','q1_rushing_receiving_yards','q1_anytime_td','q1_rush_attempts'])assert.ok(data[m].rows.every(row=>!nflRankingDisplay(row,now)));
});
test('exact normalized probabilities can price signed NFL research EV without generating a betting selection',()=>{
 const row=structuredClone(data.passing_yards.rows[0]);delete row.researchForecast.giReason;delete row.researchForecast.selectionReason;
 const e=nflRankingDisplay(row,now);assert.equal(e.ev.status,'available');assert.equal(e.ev.side,'UNDER');assert.ok(e.ev.percent>0);assert.equal(e.confidence,100*row.researchForecast.priceComparison.underProbability);assert.equal(row.researchForecast.modelSelection,null);assert.equal(rankingRowIsPick(row,now),false);
 row.researchForecast.priceComparison.quoteEvidence.overPrice=500;assert.equal(nflRankingDisplay(row,now).ev.status,'unavailable');
});
test('wrong sport, invalid quote, after-start recovery, unavailable player and tampered capture remain excluded',()=>{
 const row=data.passing_yards.rows[0];for(const change of [{sport:'nba'},{sport:'nhl'},{underPrice:null},{quoteId:null},{quotePeriod:'q1'},{quoteMarket:'receiving_yards'},{recoveredAfterStart:true},{withdrawnFromBoard:true},{injuryStatus:'Out'},{boardCapturedAt:'2026-11-16T00:00Z'}])assert.equal(nflRankingDisplay({...row,...change},now),null);
 const fresh={...row,boardFrozen:false,frozen:false,lockedAtKickoff:false};assert.equal(nflRankingDisplay(fresh,now),null,'stale unsaved quotes cannot be promoted');
 const future=structuredClone(row);future.researchForecast.calculatedAt='2026-11-16T00:00Z';assert.equal(nflRankingDisplay(future,now).projection,null);
});
test('started quarterbacks retain the original quote when the forecast is missing',()=>{
 const begun=data.passing_yards.rows.filter(row=>Date.parse(row.gameTime)<=now);
 assert.ok(begun.length>0);
 for(const row of begun){
  const original=JSON.stringify(row);
  const evidence=nflRankingDisplay({...row,researchForecast:undefined},now);
  assert.equal(evidence.quoteBasis,'saved_pregame');
  assert.equal(evidence.projection,null);
  assert.equal(evidence.confidence,null);
  assert.equal(evidence.direction,null);
  assert.equal(evidence.ev.status,'unavailable');
  assert.equal(JSON.stringify(row),original);
 }
});
test('negative and zero exact-price NFL comparisons remain signed and never acquire selections',()=>{
 const row=structuredClone(data.passing_yards.rows[0]);delete row.researchForecast.giReason;delete row.researchForecast.selectionReason;const p=row.researchForecast.priceComparison;
 p.underProbability=.1;p.overProbability=.9;p.pushProbability=0;assert.ok(nflRankingDisplay(row,now).ev.percent<0);
 p.underProbability=112/212;p.overProbability=100/212;assert.ok(Math.abs(nflRankingDisplay(row,now).ev.percent)<1e-10);assert.equal(rankingRowIsPick(row,now),false);
 p.underProbability=2;assert.equal(nflRankingDisplay(row,now).ev.status,'unavailable');
});
test('two-sided NFL quarter forecasts retain their projection direction without being promoted to betting picks',()=>{
 const row=data.q1_passing_yards.rows.find(r=>r.lineType==='main'&&nflRankingDisplay(r,now)?.projection!=null);assert.ok(row);
 const e=nflRankingDisplay(row,now);assert.equal(e.direction,e.projection>row.sportsbookLine?'OVER':e.projection<row.sportsbookLine?'UNDER':'AT LINE');assert.equal(e.confidence,null);assert.equal(e.ev.status,'unavailable');assert.equal(rankingRowIsPick(row,now),false);
});
