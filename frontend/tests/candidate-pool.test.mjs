import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {mapCandidatePool,rollingFootballRows}=await loadTs(new URL('../lib/candidate-pool.ts',import.meta.url));
const {excludeUnavailablePregame}=await loadTs(new URL('../lib/ranking-availability.ts',import.meta.url));
test('candidate pool exhausts past old 90-row cutoff with at most eight concurrent enrichments',async()=>{
 let active=0,max=0;const result=await mapCandidatePool(Array.from({length:140},(_,i)=>i),async i=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return i<110?null:{playerId:i}});assert.equal(result.filter(Boolean).length,30);assert.ok(max<=8);assert.equal(result[139].playerId,139);
});
test('started originals retain rank and evidence without consuming rolling pregame slots',()=>{
 const now=Date.parse('2026-11-07T18:00Z'),saved=Array.from({length:30},(_,i)=>({id:i,rank:i%25+1,gameState:'in',gameTime:'2026-11-07T17:00Z',line:10.5,quoteId:'original'+i})),fresh=Array.from({length:40},(_,i)=>({id:100+i,gameTime:'2026-11-07T20:00Z'}));const before=JSON.stringify(saved),out=rollingFootballRows(saved,[...saved,...fresh],r=>r.id,now);assert.equal(out.length,55);assert.deepEqual(out.slice(0,25).map(r=>r.rank),Array.from({length:25},(_,i)=>i+1));assert.equal(JSON.stringify(saved),before);assert.deepEqual(out.slice(25),saved);
});
test('unavailable status variants are gated pregame across active sports without changing frozen originals',()=>{
 for(const sport of ['nba','nfl','nhl','cbb','cfb'])for(const status of ['Ruled Out','LTIR','IR-LT','Non-Roster','Assigned to Minors']){const r={sport,availabilityStatus:status,gameTime:'2099-01-01'};assert.equal(excludeUnavailablePregame(r),true);assert.equal(excludeUnavailablePregame({...r,boardFrozen:true}),false);}
});
