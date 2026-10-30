import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {quarterTargetDisplay:display}=await loadTs(new URL('../lib/quarter-target-display.ts',import.meta.url));
const now=Date.parse('2026-10-29T20:00Z'),at=new Date(now).toISOString();
function row(projection=4){const r={market:'q1_receiving_yards',gameId:'g',playerId:'p',gameTime:'2026-10-30T00:00Z',lineType:'milestone',sportsbookLine:5,quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',quoteId:'q',overPrice:-300,underPrice:null,quoteUpdatedAt:'2026-10-29T19:59Z',capturedAt:at};return {...r,researchForecast:{status:'available',projection,calculatedAt:at,modelTargetForecast:{target:5,quoteId:'q',direction:projection>=5?'REACHES':'BELOW',calculatedAt:at},quoteEvidence:{market:r.market,gameId:'g',playerId:'p',quoteId:'q',sportsbookKey:'book',line:5,overPrice:-300,underPrice:null,calculatedAt:at}}}}
test('the saved target forecast distinguishes below, reaches, and exact-target without inventing an under quote',()=>{
 assert.equal(display(row(),now).label,'BELOW 5');assert.equal(display(row(7),now).label,'5+');assert.equal(display(row(5),now).direction,'REACHES');assert.equal(row().underPrice,null);
});
test('frozen target forecast survives start; unlocked post-start and stale quotes do not',()=>{
 const r=row(),later=Date.parse('2026-10-30T03:00Z');assert.equal(display({...r,boardFrozen:true,boardCapturedAt:at},later).label,'BELOW 5');assert.equal(display(r,later),null);assert.equal(display(r,now+16*60000),null);
});
test('mismatched quote/player/target/time or contradictory comparison is withheld',()=>{
 const r=row();for(const patch of [{lineType:'main'},{playerId:'other'},{sportsbookLine:6},{quoteId:'other'},{overPrice:-200},{underPrice:-110},{boardCapturedAt:'2026-10-29T19:58Z',boardFrozen:true}])assert.equal(display({...r,...patch},now),null);
 for(const patch of [{direction:'REACHES'},{target:6},{calculatedAt:'2026-10-30T00:01Z'}])assert.equal(display({...r,researchForecast:{...r.researchForecast,modelTargetForecast:{...r.researchForecast.modelTargetForecast,...patch}}},now),null);
 assert.equal(display({...r,researchForecast:{...r.researchForecast,projection:null}},now),null);
});
