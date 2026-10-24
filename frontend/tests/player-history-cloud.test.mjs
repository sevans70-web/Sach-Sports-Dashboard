import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {playerGameObservations}=await loadTs(new URL('../lib/player-game-observations.ts',import.meta.url));
test('cloud player history retains exact games and zero values; excludes undated averages, projections and missing values',()=>{
 const rows=playerGameObservations('nba','1','points',[{gameId:'a',date:'2026-10-22T02:00Z',value:0,opponent:'BOS'},{gameId:'b',date:'2026-10-20',value:25},{gameId:'c',date:'2026-10-19',value:null},{gameId:'d',value:20},{date:'2026-10-18',value:99},{gameId:'e',date:'2026-10-17',projection:12},{gameId:'f',date:'2026-10-16',value:''}]);
 assert.equal(rows.length,2);assert.equal(rows[0].actual,0);assert.equal(rows[0].point.opponent,'BOS');assert.equal(rows[0].market,'points');assert.equal(rows[0].point.value,0);
});
test('MLB final observations retain zeros, exact innings-outs conversion and never infer absent stats',async()=>{
 const {hiddenGameObservations}=await loadTs(new URL('../lib/hidden-game-observations.ts',import.meta.url));
 const rows=hiddenGameObservations('mlb','game',{gameDate:'2026-10-24T01:00Z'},{teams:{home:{team:{name:'Home'},players:{one:{person:{id:1},stats:{batting:{hits:0,runs:0,rbi:0}}},two:{person:{id:2},stats:{pitching:{inningsPitched:'5.2',strikeOuts:0}}}}},away:{team:{name:'Away'},players:{}}}});
 assert.equal(rows.find(r=>r.player_id==='1'&&r.market==='hits').actual,0);assert.equal(rows.find(r=>r.player_id==='2'&&r.market==='outs_recorded').actual,17);assert.equal(rows.find(r=>r.player_id==='1'&&r.market==='home_runs'),undefined);assert.equal(rows.find(r=>r.market==='hits_runs_rbis').actual,0);
});
