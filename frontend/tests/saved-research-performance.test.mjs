import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {savedResearchDecisions,observeSavedResearch}=await loadTs(new URL('../lib/saved-research-performance.ts',import.meta.url));
const row={playerId:'1',gameId:'2',market:'points',gameTime:'2026-10-25T20:00Z',quoteVerified:true,sportsbookLine:10.5,researchForecast:{status:'available',projection:8}};
test('all sports recover original fitted research forecasts without certifying betting picks or recalculating projections',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){const records=savedResearchDecisions([{capturedAt:'2026-10-25T10:00Z',rows:[{...row,sport}]}]);assert.equal(records[0].pickSide,'UNDER');assert.equal(records[0].modelProjection,8);assert.equal(records[0].status,'pending');assert.equal(records[0].validatedForBetting,undefined);}
 for(const r of [{...row,quoteVerified:false},{...row,researchForecast:{status:'unavailable',projection:8}},{...row,boardCapturedAt:'2026-10-25T21:00Z'}])assert.equal(savedResearchDecisions([{capturedAt:'2026-10-25T10:00Z',rows:[r]}]).length,0);
});
test('research grades use exact official finals without altering the stored original forecast',async()=>{
 const records=savedResearchDecisions([{capturedAt:'2026-10-25T10:00Z',rows:[row]}]),original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({success:true,gameId:'2',state:'post',rows:[{playerId:'1',stats:{points:0}}]});
 try{const graded=await observeSavedResearch(records,'nba');assert.equal(graded[0].status,'hit');assert.equal(graded[0].actual,0);assert.equal(graded[0].modelProjection,8);assert.equal(records[0].status,'pending');}finally{globalThis.fetch=original;}
});

test('official final observations remain cached across the one-minute UI refresh and still allow later corrections',async()=>{
 const originalFetch=globalThis.fetch,originalNow=Date.now;let now=Date.parse('2026-10-26T01:00Z'),calls=0;
 const records=savedResearchDecisions([{capturedAt:'2026-10-25T10:00Z',rows:[{...row,gameId:'333'}]}]);
 globalThis.fetch=async()=>{calls++;return Response.json({success:true,gameId:'333',state:'post',rows:[{playerId:'1',stats:{points:0}}]});};Date.now=()=>now;
 try{await observeSavedResearch(records,'nba');now+=60000;await observeSavedResearch(records,'nba');assert.equal(calls,1);now+=16*60000;await observeSavedResearch(records,'nba');assert.equal(calls,2);}finally{globalThis.fetch=originalFetch;Date.now=originalNow;}
});
