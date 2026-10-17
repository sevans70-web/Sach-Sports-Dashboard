import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {dashboardSlate,dashboardCounts}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
test('football verified totals exclude retained legacy lines with no quote provenance',()=>{
 const games=[{id:'a',date:'2026-10-18T17:00:00Z',state:'pre'}];
 const row={playerId:'1',gameId:'a',sportsbookLine:289.5,modelProjection:300,marketBacked:true};
 const counts=dashboardCounts(games,[row,{...row,playerId:'2',quoteVersion:1}],true);
 assert.equal(counts.rankedPlayers,2);assert.equal(counts.playerProps,1);assert.equal(counts.predictions,1);
 assert.equal(dashboardCounts(games,[row]).predictions,1);
});
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
test('the full calendar keeps later published games beyond the current dashboard preview',()=>{
 const now=new Date('2026-10-17T12:00:00-04:00'),games=[{id:'today',date:'2026-10-17T20:00:00Z',state:'pre'},{id:'next',date:'2026-10-18T20:00:00Z',state:'pre'},{id:'later',date:'2026-11-02T20:00:00Z',state:'pre'}];
 assert.equal(dashboardSlate(games,now).length,2);assert.equal(dashboardSlate(games,now,true).length,3);
});
