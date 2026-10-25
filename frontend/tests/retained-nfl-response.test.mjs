import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {retainedNflRankingPayload}=await loadTs(new URL('../lib/retained-nfl-response.ts',import.meta.url));
const now=Date.parse('2026-10-25T19:00Z'),market='receiving_yards';
const frozen={market,playerId:'original',gameId:'early',gameTime:'2026-10-25T17:00Z',rank:1,boardFrozen:true,boardCapturedAt:'2026-10-25T13:00Z',sportsbookLine:68.5,researchForecast:{status:'available',projection:87.8}};
const upcoming={market,playerId:'future',gameId:'late',gameTime:'2026-10-25T20:25Z',rank:2,quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',quoteId:'q',lineType:'main',sportsbookLine:50.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:'2026-10-25T18:59Z',capturedAt:'2026-10-25T18:59Z',researchForecast:{status:'available',projection:60}};
const locked={rows:[frozen],lockedSlates:['early']};
const published={market,featuredCapturedAt:'2026-10-25T18:59Z',rows:[upcoming]};
test('NFL immediately returns unchanged original early decisions alongside genuine current pregame rows',()=>{
 const before=JSON.stringify({locked,published});const p=retainedNflRankingPayload(locked,published,market,'2026-10-25',now);
 assert.equal(p.rows.length,2);assert.equal(p.rows[0],frozen);assert.equal(p.rows[0].sportsbookLine,68.5);assert.equal(p.rows[0].researchForecast.projection,87.8);assert.equal(p.rows[1].sportsbookLine,50.5);assert.equal(p.refreshing,true);assert.equal(p.validRankingCount,2);assert.equal(JSON.stringify({locked,published}),before);
});
test('stale, wrong-day, already-started and unverified fresh rows cannot replace or remove the original locked board',()=>{
 for(const patch of [{quoteUpdatedAt:'2026-10-25T17:00Z'},{gameTime:'2026-10-26T20:25Z'},{gameTime:'2026-10-25T18:00Z'},{underPrice:null}]){
 const p=retainedNflRankingPayload(locked,{...published,rows:[{...upcoming,...patch}]},market,'2026-10-25',now);assert.equal(p.rows.length,1);assert.equal(p.rows[0],frozen);
 }
 assert.equal(retainedNflRankingPayload(null,null,market,'2026-10-25',now),null);
 assert.equal(retainedNflRankingPayload(locked,published,market,'2026-10-26',now),null);
});
