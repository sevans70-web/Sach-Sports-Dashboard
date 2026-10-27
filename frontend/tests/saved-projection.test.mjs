import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const api=await loadTs(new URL('../lib/saved-projection.ts',import.meta.url));
test('all eight sports retain original projection independently of live/final actuals and later forecasts',()=>{
 for(const sport of ['mlb','nfl','cfb','nba','wnba','nhl','soccer','cbb']){
 const row={sport,gameId:'g',playerId:'p',market:'points',gameTime:'2026-10-26T20:00Z',modelProjection:99,actual:40,gameState:'post'};
 const saved={...row,modelProjection:17.5,savedAt:'2026-10-26T19:00Z',sportsbookLine:18.5,pickSide:'UNDER'};
 const before=JSON.stringify({row,saved});const receipt=api.savedProjectionEvidence(row,saved,Date.parse('2026-10-26T22:00Z'));assert.equal(receipt.projection,17.5);assert.equal(api.savedProjectionText({...saved,projection:17.5}), '17.5');assert.equal(JSON.stringify({row,saved}),before);
 assert.equal(api.savedProjectionEvidence(row,{...saved,modelProjection:0}).projection,0);
 for(const bad of [{...saved,playerId:'wrong'},{...saved,gameId:'wrong'},{...saved,market:'rebounds'},{...saved,savedAt:'2026-10-26T21:00Z'},{...saved,modelProjection:null,projection:null}])assert.equal(api.savedProjectionEvidence(row,bad,Date.parse('2026-10-26T22:00Z')),null);
 }
});
test('a frozen board preserves its recorded fitted projection; missing projections never become actuals',()=>{
 const row={boardFrozen:true,boardCapturedAt:'2026-10-26T19:00Z',gameTime:'2026-10-26T20:00Z',researchForecast:{status:'available',projection:12.3,calculatedAt:'2026-10-26T18:59Z'},actual:30};
 assert.equal(api.savedProjectionEvidence(row,null,Date.parse('2026-10-26T22:00Z')).projection,12.3);assert.equal(api.savedProjectionText({actual:30}), 'Not recorded');assert.equal(api.savedProjectionText({projection:0,actual:30}),'0');assert.equal(api.savedProjectionEvidence({...row,boardCapturedAt:'2026-10-26T21:00Z'},null,Date.parse('2026-10-26T22:00Z')),null);
});

test('saved fitted forecast wins over season baseline and remains separate from final actual',()=>{
 const record={modelProjection:12.216666,actual:7,gameTime:'2026-10-26T23:00Z',boardCapturedAt:'2026-10-26T22:57Z',researchForecast:{status:'available',projection:8.5,calculatedAt:'2026-10-26T22:55Z'}};
 assert.equal(api.recordedProjectionValue(record),8.5);assert.equal(api.savedProjectionText(record),'8.5');assert.equal(api.recordedProjectionValue({...record,researchForecast:{...record.researchForecast,calculatedAt:'2026-10-27T01:00Z'}}),12.216666);assert.equal(record.actual,7);
});

test('a saved NFL featured record can prove its original projection with boardCapturedAt',()=>{
 const row={gameId:'g',playerId:'p',market:'passing_yards',gameTime:'2026-10-25T20:25Z'};
 const record={...row,modelProjection:280.6,actual:274,boardCapturedAt:'2026-10-25T12:29Z',researchForecast:{status:'available',projection:235.9,calculatedAt:'2026-10-25T12:28Z'}};
 assert.equal(api.savedProjectionEvidence(row,record,Date.parse('2026-10-26T12:00Z')).projection,235.9);
});
