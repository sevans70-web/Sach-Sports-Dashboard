import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballForecastDisplay,footballForecastOutcome}=await loadTs(new URL('../lib/football-forecast-display.ts',import.meta.url));
const row={playerId:'p',gameId:'g',market:'receiving_yards',quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',lineType:'main',quoteId:'q',sportsbookLine:50.5,overPrice:-110,underPrice:-110,capturedAt:'2026-10-25T16:55Z',quoteUpdatedAt:'2026-10-25T16:54Z',gameTime:'2026-10-25T17:00Z',boardCapturedAt:'2026-10-25T16:55Z',boardFrozen:true,recommendationEligible:false,researchForecast:{status:'available',projection:60,modelSelection:null,selectionReason:'price_validation_failed',priceComparison:{overProbability:.6,underProbability:.4}}};
test('forecast direction remains visible without claiming model validation; final actual never changes the side',()=>{
 const a=footballForecastDisplay(row,Date.parse('2026-10-25T18:00Z'));assert.equal(a.side,'OVER');assert.equal(a.projection,60);assert.equal(a.validated,false);assert.equal(a.probability,60);
 assert.equal(footballForecastDisplay({...row,actualResult:0},Date.parse('2026-10-25T18:00Z')).side,'OVER');
 assert.equal(footballForecastOutcome(a.side,0,50.5),'MISS');assert.equal(footballForecastOutcome('UNDER',0,50.5),'HIT');assert.equal(footballForecastOutcome('OVER',50.5,50.5),'PUSH');
});
test('missing evidence cannot manufacture a forecast, probability or GI',()=>{assert.equal(footballForecastDisplay({...row,researchForecast:null,modelProjection:null}).side,null);assert.equal(footballForecastOutcome('UNDER',null,50.5),null)});
