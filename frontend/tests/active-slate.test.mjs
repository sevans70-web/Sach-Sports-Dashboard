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

test('entire live slate survives Toronto midnight, month rollover and both DST weekends',()=>{
 const toronto=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
 for(const at of ['2026-11-01T05:30Z','2026-03-08T06:30Z','2026-11-01T07:30Z','2026-11-01T04:30Z']){
  const now=new Date(at),prior=new Date(now.getTime()-12*3600000).toISOString(),later=new Date(now.getTime()+12*3600000).toISOString();
  const games=[{gameId:'finished-original',tipoff:prior,state:'post',originalPrice:125},{gameId:'late-live',tipoff:prior,state:'in'},{gameId:'next',tipoff:later,state:'pre'}];
  const selected=activeRankingSlate(games,toronto,now);assert.ok(selected.includes(games[0]));assert.ok(selected.includes(games[1]));assert.equal(selected[0].originalPrice,125);
  assert.equal(games[0].state,'post');
 }
});
test('completed early games remain between kickoff windows; an entirely finished prior slate may advance',()=>{
 const games=[{gameId:'early',tipoff:'2026-10-30T12:00Z',state:'post'},{gameId:'late',tipoff:'2026-10-30T23:00Z',state:'pre'},{gameId:'next',tipoff:'2026-10-31T23:00Z',state:'pre'}];
 assert.deepEqual(activeRankingSlate(games,day,new Date('2026-10-30T20:00Z')).map(g=>g.gameId),['early','late']);
 games[1].state='post';assert.deepEqual(activeRankingSlate(games,day,new Date('2026-10-31T03:00Z')).map(g=>g.gameId),['next']);
});
