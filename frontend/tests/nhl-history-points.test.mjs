import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nhlHistoryPoints:points}=await loadTs(new URL('../lib/nhl-history-points.ts',import.meta.url));
const {datedCardHistory:history}=await loadTs(new URL('../lib/public-prop-context.ts',import.meta.url));
test('goalie history derives saves from shots minus goals and excludes explicit unused appearances',()=>{
 const p={gameLog:[{gameId:1,gameDate:'2026-10-15',shotsAgainst:25,goalsAgainst:2,toi:'60:00'},{gameId:2,gameDate:'2026-10-16',saves:0,toi:'00:00'},{gameId:3,gameDate:'2026-10-17',shotsAgainst:20}]};const r=points(p,'goalie_saves');assert.equal(r.length,1);assert.equal(r[0].value,23);
});
test('missing hockey values never become zero or a partial combined total',()=>{
 const p={gameLog:[{gameId:1,gameDate:'2026-10-15',goals:1,toi:'15:00'},{gameId:2,gameDate:'2026-10-16',goals:0,assists:0,toi:'15:00'},{gameId:3,gameDate:'2026-10-17',shots:null,toi:'15:00'}]};assert.deepEqual(points(p,'points').map(r=>r.value),[0]);assert.deepEqual(points(p,'shots_on_goal'),[]);
});
test('date-only hockey history excludes the target Eastern game day and target fixture',()=>{
 const p=[{gameId:'old',date:'2026-10-17',value:2},{gameId:'target',date:'2026-10-18',value:9},{gameId:'later',date:'2026-10-19',value:7}];assert.deepEqual(history(p,'2026-10-19T00:00:00Z','points','nhl','target'),[2]);
});
