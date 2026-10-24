import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {firstBasketQuote,publicNbaRanking}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
const {cardModelProjection}=await loadTs(new URL('../lib/saved-model-pick.ts',import.meta.url));
const now=Date.parse('2026-10-23T18:00Z'),stamp='2026-10-23T17:59Z',start='2026-10-23T23:00Z';
const quote={market:'first_basket',quoteVersion:1,gameId:'g',playerId:'p',gameTime:start,lineType:'scorer',sportsbook:'FanDuel',sportsbookKey:'fanduel',quoteId:'q',overPrice:900,quoteUpdatedAt:stamp,capturedAt:stamp};
test('first basket uses an exact scorer price as a labelled book-implied chance, never an O/U line or independent forecast',()=>{
 assert.deepEqual(firstBasketQuote(quote,now),{probability:10,price:900,sportsbook:'FanDuel',basis:'bookmaker_implied'});
 assert.equal(firstBasketQuote({...quote,overPrice:-150},now).probability,60);
 assert.equal(publicNbaRanking(quote,now),true);
 for(const patch of [{quoteVersion:undefined},{quoteUpdatedAt:'2026-10-23T16:00Z'},{market:'points'},{lineType:'main'},{recoveredAfterStart:true}])assert.equal(firstBasketQuote({...quote,...patch},now),null);
});
test('Tre Jones final result cannot replace or fabricate the saved pregame projection',()=>{
 const row={...quote,market:'points',sportsbookLine:9.5,underPrice:-115,lineType:'main',boardFrozen:true,boardCapturedAt:stamp,actualResult:11,gameState:'post',researchForecast:{status:'available',projection:16.2,modelSelection:{side:'OVER',line:9.5,price:900,sportsbookKey:'fanduel',quoteId:'q',calculatedAt:stamp}}};
 assert.equal(cardModelProjection(row,now),16.2);assert.equal(publicNbaRanking(row,now),true);
 assert.equal(cardModelProjection({...row,actualResult:30},now),16.2);
 assert.equal(publicNbaRanking({...row,researchForecast:{status:'unavailable'}},now),false);
 assert.equal(publicNbaRanking({...row,researchForecast:{...row.researchForecast,modelSelection:null}},now),false);
});
