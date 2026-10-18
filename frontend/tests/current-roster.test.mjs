import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {currentRosterPlayers,espnRosterIds,nhlRosterIds}=await loadTs(new URL('../lib/current-roster.ts',import.meta.url));
test('a historical team cannot override a verified current roster or attach an unlisted player',async()=>{
 const p=[{playerId:1,team:'OLD',actual:4},{playerId:2,team:'A'},{playerId:3,team:'A'}];
 const r=await currentRosterPlayers(p,[{id:'a',abbr:'A'},{id:'b',abbr:'B'}],async id=>id==='a'?['2']:['1']);
 assert.deepEqual(r.players,[{playerId:1,team:'B',actual:4},{playerId:2,team:'A'}]);assert.equal(p[0].team,'OLD');
});
test('conflicting membership and failed or empty rosters abstain per team',async()=>{
 const p=[{playerId:1,team:'A'},{playerId:2,team:'C'}];
 const r=await currentRosterPlayers(p,[{id:'a',abbr:'A'},{id:'b',abbr:'B'},{id:'c',abbr:'C'}],async id=>id==='c'?[]:['1']);
 assert.deepEqual(r.players,[]);assert.deepEqual(r.unavailableTeams,['C']);
});
test('official roster adapters use athlete IDs across grouped and flat formats',()=>{
 assert.deepEqual(espnRosterIds({athletes:[{items:[{athlete:{id:'1'}}]},{id:'2'}]}),['1','2']);
 assert.deepEqual(nhlRosterIds({forwards:[{id:1}],defensemen:[{id:2}],goalies:[{id:3}]}),['1','2','3']);
});
