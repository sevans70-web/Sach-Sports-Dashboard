import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {officialFeaturedResult}=await loadTs(new URL('../lib/featured-official-result.ts',import.meta.url));
const row={gameId:'123',playerId:'4',market:'points',gameTime:'2026-10-25T20:00Z',boardCapturedAt:'2026-10-25T10:00Z',prediction:'UNDER',sportsbookLine:1.5};
const payload={success:true,gameId:'123',state:'post',rows:[{playerId:'4',stats:{points:0}}]};
test('exact official finals settle original OVER UNDER and event selections, preserving zero and pushes',()=>{
 assert.equal(officialFeaturedResult(row,payload).status,'hit');assert.equal(officialFeaturedResult(row,payload).actual,0);
 assert.equal(officialFeaturedResult({...row,prediction:'OVER'},payload).status,'miss');assert.equal(officialFeaturedResult({...row,sportsbookLine:0},payload).status,'push');assert.equal(officialFeaturedResult({...row,prediction:'YES'},payload).status,'miss');
});
test('wrong fixture, live, missing stats and post-start selections never become historical wins',()=>{
 for(const p of [{...payload,gameId:'wrong'},{...payload,state:'in'},{...payload,rows:[]},{...payload,rows:[{playerId:'4',stats:{points:null}}]}])assert.equal(officialFeaturedResult(row,p),null);
 assert.equal(officialFeaturedResult({...row,boardCapturedAt:'2026-10-25T20:01Z'},payload),null);
});

test('scorer markets settle occurrence, never a numeric push at the legacy line',()=>{
 for(const market of ['anytime_td','first_td','first_basket'])for(const prediction of ['OVER','UNDER'])for(const stat of [0,1,2]){
 const row={gameId:'7',playerId:'9',market,prediction,sportsbookLine:1,boardCapturedAt:'2026-10-25T16:55:00Z',gameTime:'2026-10-25T17:00:00Z'};
 const payload={success:true,gameId:'7',state:'post',rows:[{playerId:'9',stats:{[market]:stat}}]};
 assert.equal(officialFeaturedResult(row,payload).status,(prediction==='UNDER'?stat===0:stat>0)?'hit':'miss');
 }
});
