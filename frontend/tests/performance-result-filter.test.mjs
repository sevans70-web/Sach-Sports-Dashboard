import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {performanceResponseScope}=await loadTs(new URL('../lib/performance-response-scope.ts',import.meta.url));
const {savedHistorySummary,historyDays,historyGroup}=await loadTs(new URL('../lib/saved-performance.ts',import.meta.url));
const {filterPerformanceResults}=await loadTs(new URL('../lib/performance-result-filter.ts',import.meta.url));
const now=new Date('2026-10-28T16:00Z');
test('all eight integrations reconcile duplicates, original grading terms, withdrawals and every period before counts/filtering',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
  const row={sport,gameId:'g',playerId:'p',market:'points',gameTime:'2026-10-28T20:00Z',gameDate:'2026-10-27',savedAt:'2026-10-28T10:00Z',status:'hit',pickSide:'OVER',sportsbookLine:1.5,actual:2};
  const rows=[row,{...row,key:'another-copy'},...['miss','push','pending','unknown','void'].map((status,i)=>({...row,playerId:'p'+i,status})),{...row,playerId:'withdrawn',withdrawnFromBoard:true},{...row,playerId:'incomplete',pickSide:null},{...row,gameId:'yesterday',gameTime:'2026-10-27T20:00Z'},{...row,gameId:'old',gameTime:'2026-09-01T20:00Z'}];const original=JSON.stringify(rows);
  for(const period of ['Today','Yesterday','Week','Month','Season']){
   const scoped=performanceResponseScope(rows,period,now),summary=savedHistorySummary(scoped);
   assert.equal(summary.total,scoped.length);assert.equal(summary.hits,filterPerformanceResults(scoped,'hit').length);assert.equal(summary.completed,summary.hits+summary.misses+summary.pushes);assert.equal(summary.total,summary.completed+summary.awaitingResult+summary.void+summary.unknown);
   assert.equal(new Set(scoped.map(r=>r.key)).size,scoped.length);
   const categories=[...new Set(scoped.map(r=>r.market))];assert.equal(categories.reduce((n,m)=>n+savedHistorySummary(scoped.filter(r=>r.market===m)).total,0),summary.total);
  }
  const today=performanceResponseScope(rows,'Today',now);assert.equal(today.length,8);assert.equal(filterPerformanceResults(today,'hit').length,1);assert.equal(filterPerformanceResults(today,'void').length,2);assert.equal(filterPerformanceResults(today,'unknown').length,2);assert.equal(performanceResponseScope(rows,'Yesterday',now).length,1);assert.equal(performanceResponseScope(rows,'Season',now).length,10);assert.equal(JSON.stringify(rows),original);
  assert.equal(filterPerformanceResults(today,'all'),today);
 }
});
test('Toronto calendar scopes remain consecutive across both daylight-saving transitions',()=>{
 assert.deepEqual([...historyDays('Week',new Date('2026-11-02T04:30Z'))],['2026-11-01','2026-10-31','2026-10-30','2026-10-29','2026-10-28','2026-10-27','2026-10-26']);
 assert.deepEqual([...historyDays('Yesterday',new Date('2026-03-09T04:30Z'))],['2026-03-08']);
});
test('market/group and soccer league scopes do not leak into neighboring categories',()=>{
 const rows=['passing_yards','rushing_yards','q1_passing_yards'].flatMap((market,i)=>['eng.1','ita.1'].map(league=>({key:market+league,gameId:'g',playerId:String(i),market,league,gameTime:'2026-10-28T20:00Z',savedAt:'2026-10-28T10:00Z',status:'pending'})));
 const league=performanceResponseScope(rows,'Today',now,'ita.1');assert.equal(league.length,3);assert.ok(league.every(r=>r.league==='ita.1'));assert.equal(league.filter(r=>historyGroup(r,'nfl')==='QB').length,1);assert.equal(league.filter(r=>historyGroup(r,'nfl')==='Q1').length,1);
});
