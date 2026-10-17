import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {footballHistoryValues}=await loadTs(new URL('../lib/football-history.ts',import.meta.url));
test('football projections receive oldest-to-newest games regardless of provider order',()=>{
 const p={names:['passingYards'],events:{a:{gameDate:'2026-10-10'},b:{gameDate:'2026-10-03'},c:{gameDate:'2026-09-26'}},seasonTypes:[{categories:[{type:'event',events:[{eventId:'a',stats:['300']},{eventId:'b',stats:['200']},{eventId:'c',stats:['100']}]}]}]};
 assert.deepEqual(footballHistoryValues(p,['passingyards']),[100,200,300]);
});
test('football history keeps actual zero, skips absent statistics and deduplicates games',()=>{
 const p={names:['rushingYards'],seasonTypes:[{categories:[{type:'event',events:[{eventId:'1',stats:[null]},{eventId:'2',stats:['0']},{eventId:'3',stats:['—']},{eventId:'2',stats:['0']}]}]}]};
 assert.deepEqual(footballHistoryValues(p,['rushingyards']),[0]);
});
