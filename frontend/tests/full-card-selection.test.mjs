import test from'node:test';import assert from'node:assert/strict';import{loadTs}from'./load-ts.mjs';
const{fullCardSelection}=await loadTs(new URL('../lib/full-card-selection.ts',import.meta.url));
const identity={playerId:'p',gameId:'g',quoteId:'q',forecastAt:'2026-10-29T12:00:00Z'},ev={status:'available',playerId:'p',gameId:'g',quoteId:'q',calculatedAt:identity.forecastAt,side:'UNDER',line:20.5,odds:-120,sportsbook:'Book'};
test('full card takes the exact saved line, side and odds only from matched server evidence',()=>{assert.deepEqual(fullCardSelection({ev},identity),{side:'UNDER',line:20.5,odds:-120,sportsbook:'Book',quoteId:'q'});});
test('URL pick and odds cannot verify a selection; incomplete and mismatched server evidence is withheld',()=>{
 assert.equal(fullCardSelection({pick:'OVER',line:2,odds:300},identity),null);
 for(const patch of [{status:'unavailable'},{playerId:'other'},{gameId:'other'},{quoteId:'other'},{calculatedAt:'2026-10-28T12:00:00Z'},{side:'YES'},{line:NaN},{odds:20}])assert.equal(fullCardSelection({ev:{...ev,...patch}},identity),null);
 assert.equal(fullCardSelection({ev},{playerId:'p'}),null);
});

test('full-card projection comes from a matched saved forecast, never query projection flags',async()=>{
 const {fullCardForecast}=await loadTs(new URL('../lib/full-card-selection.ts',import.meta.url));
 assert.equal(fullCardForecast({projection:99,projectionSource:'fitted_model'},identity),null);
 const forecast={playerId:'p',gameId:'g',quoteId:'q',projection:12.3,line:10.5};
 assert.equal(fullCardForecast({forecast},identity).projection,12.3);
 assert.equal(fullCardForecast({forecast:{...forecast,gameId:'other'}},identity),null);
});
