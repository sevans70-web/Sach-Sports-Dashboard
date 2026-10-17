import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {activeRankingSlate}=await loadTs(new URL('../lib/active-ranking-slate.ts',import.meta.url));
const day=v=>new Date(v).toISOString().slice(0,10);
test('an idle day uses the next game day for both rankings and capture',()=>{
 const games=[{gameId:'old',tipoff:'2026-10-15T19:00Z',state:'post'},{gameId:'next',tipoff:'2026-10-18T19:00Z',state:'pre'},{gameId:'later',tipoff:'2026-10-20T19:00Z',state:'pre'}];
 assert.deepEqual(activeRankingSlate(games,day,new Date('2026-10-16T20:00Z')).map(g=>g.gameId),['next']);
});
test('live games remain on the slate across midnight alongside current-day games',()=>{
 const games=[{gameId:'live',tipoff:'2026-10-16T23:00Z',state:'in'},{gameId:'today',tipoff:'2026-10-17T19:00Z',state:'pre'},{gameId:'later',tipoff:'2026-10-18T19:00Z',state:'pre'}];
 assert.deepEqual(activeRankingSlate(games,day,new Date('2026-10-17T01:00Z')).map(g=>g.gameId),['live','today']);
});
