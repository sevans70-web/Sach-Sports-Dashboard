import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {recordedCardForecast}=await loadTs(new URL('../lib/full-card-forecast.ts',import.meta.url));
const now=Date.parse('2026-10-30T15:00Z');
const row={playerId:'p',gameId:'g',market:'points',gameTime:'2026-10-30T20:00Z',boardCapturedAt:'2026-10-30T14:00Z',quoteVersion:1,quoteId:'original',sportsbookKey:'book',sportsbook:'Book',lineType:'main',sportsbookLine:10.5,overPrice:110,underPrice:-130,quoteUpdatedAt:'2026-10-30T13:59Z',researchForecast:{status:'available',projection:12.3,modelSelection:{calculatedAt:'2026-10-30T14:00Z'}}};
for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'])test(sport+': full card recovers the existing original projection using the saved selection timestamp',()=>{
 const original={...row,sport},before=JSON.stringify(original),f=recordedCardForecast(original,now);
 assert.equal(f.projection,12.3);assert.equal(f.calculatedAt,'2026-10-30T14:00Z');assert.equal(f.quoteId,'original');assert.equal(f.line,10.5);assert.equal(JSON.stringify(original),before);
 assert.deepEqual(recordedCardForecast({...original,boardFrozen:true,gameState:'post',actualResult:99},now+86400000),f);
});
test('late, conflicting, missing and future timestamps never manufacture a full-card projection',()=>{
 for(const r of [{...row,boardCapturedAt:'2026-10-30T21:00Z'},{...row,researchForecast:{...row.researchForecast,calculatedAt:'2026-10-30T13:59Z'}},{...row,researchForecast:{...row.researchForecast,modelSelection:null}},{...row,boardCapturedAt:'2026-10-30T16:00Z'},{...row,recoveredAfterStart:true},{...row,researchForecast:{...row.researchForecast,status:'unavailable'}},{...row,researchForecast:{...row.researchForecast,projection:null}}])assert.equal(recordedCardForecast(r,now),null);
});
test('request-start timestamp cannot hide a forecast calculated later in the same pregame capture',()=>{
 const r={...row,boardCapturedAt:undefined,capturedAt:'2026-10-30T13:59:59.172Z',researchForecast:{...row.researchForecast,calculatedAt:'2026-10-30T14:00Z'}};
 assert.equal(recordedCardForecast(r,now).projection,12.3);
 assert.equal(recordedCardForecast({...r,boardCapturedAt:r.capturedAt},now),null,'an explicit incompatible capture is still rejected');
});
