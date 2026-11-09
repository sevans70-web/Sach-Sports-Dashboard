import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {publicNbaRanking,firstBasketQuote}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
const {integrityRow,PROP_INTEGRITY_VERSION}=await loadTs(new URL('../lib/prop-integrity.ts',import.meta.url));
const now=Date.parse('2026-11-09T17:30:00Z');
const base={sport:'nba',market:'q1_points',gameId:'123',playerId:'456',gameTime:'2026-11-09T23:00:00Z',
 quoteVersion:1,quoteId:'one',sportsbook:'Book',sportsbookKey:'book',lineType:'main',
 sportsbookLine:5.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:'2026-11-09T17:00:00Z',
 boardCapturedAt:'2026-11-09T17:01:00Z',quoteVerified:true,
 integrityVersion:PROP_INTEGRITY_VERSION};
test('saved NBA Q1 Points stays in the tab after its book quote ages, only with genuine original receipt',()=>{
 assert.equal(publicNbaRanking(base,now),true);
 const integrated=integrityRow(base,'nba','q1_points',now);
 assert.equal(integrated.quoteVerified,true);
 assert.equal(integrated.sportsbookLine,5.5);
 assert.equal(publicNbaRanking({...base,boardCapturedAt:null},now),false);
 assert.equal(publicNbaRanking({...base,boardCapturedAt:'2026-11-09T23:01:00Z'},now),false);
 assert.equal(publicNbaRanking({...base,quoteUpdatedAt:'2026-11-09T16:00:00Z'},now),false);
});
test('Q1 rebounds and assists share the saved-quote visibility safeguard',()=>{
 for(const market of ['q1_rebounds','q1_assists']){
  const row={...base,market};
  assert.equal(publicNbaRanking(row,now),true);
  assert.equal(integrityRow(row,'nba',market,now).quoteVerified,true);
 }
});
test('First Basket scorer receipts retain only saved authentic pregame odds',()=>{
 const valid={...base,market:'first_basket',lineType:'scorer',sportsbookLine:null,underPrice:null,overPrice:500};
 assert.equal(firstBasketQuote(valid,now)?.price,500);
 assert.equal(publicNbaRanking(valid,now),true);
 assert.equal(firstBasketQuote({...valid,boardCapturedAt:null},now),null);
 assert.equal(firstBasketQuote({...valid,boardCapturedAt:'2026-11-09T23:01:00Z'},now),null);
});
