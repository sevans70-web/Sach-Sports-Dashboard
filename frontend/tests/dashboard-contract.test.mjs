import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {dashboardSlate,dashboardCounts}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
test('current slate retains overnight live games, today finals and the next complete day without duplicates',()=>{
 const games=[{id:'live',date:'2026-10-16T23:00:00-04:00',state:'in'},{id:'final',date:'2026-10-17T08:00:00-04:00',state:'post'},{id:'next',date:'2026-10-18T15:00:00-04:00',state:'pre'},{id:'next2',date:'2026-10-18T17:00:00-04:00',state:'pre'},{id:'later',date:'2026-10-20T17:00:00-04:00',state:'pre'}];
 assert.deepEqual(dashboardSlate([...games,games[0]],new Date('2026-10-17T12:00:00-04:00')).map(g=>g.id),['live','next','next2','final']);
});
test('snapshots count actual distinct verified picks, never multiply a top 25 or infer lineup confirmation',()=>{
 const games=[{id:'a',date:'2026-10-18T15:00:00Z',state:'pre'},{id:'b',date:'2026-10-18T18:00:00Z',state:'in',awayLineupConfirmed:true}];
 const row={playerId:'1',gameId:'a',sportsbookLine:10.5,modelProjection:12};
 const d=dashboardCounts(games,[row,row,{...row,playerId:'2',sportsbookLine:null},{...row,playerId:'3',modelProjection:null},{...row,gameId:'wrong'}]);
 assert.equal(d.games,2);assert.equal(d.lineups,4);assert.equal(d.confirmedLineups,1);assert.equal(d.pendingLineups,3);assert.equal(d.rankedPlayers,3);assert.equal(d.playerProps,2);assert.equal(d.predictions,1);assert.equal(d.verifiedRows[0].prediction,'OVER');
});
test('snapshot accepts a genuine zero line but excludes missing lines and other game days',()=>{
 const d=dashboardCounts([{id:'a',date:'2026-10-18T15:00:00Z',state:'pre'}],[{playerId:'1',gameId:'a',sportsbookLine:0,modelProjection:.5},{playerId:'2',gameTime:'2026-10-19T15:00:00Z',sportsbookLine:1,modelProjection:2}]);assert.equal(d.predictions,1);
});
