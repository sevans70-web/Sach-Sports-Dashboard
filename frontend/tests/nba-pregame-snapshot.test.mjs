import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {currentNbaPregameSnapshot}=await loadTs(new URL('../lib/nba-slate-board.ts',import.meta.url));
const at='2026-10-25T19:00:00Z',start='2026-10-25T21:00:00Z',now=Date.parse('2026-10-25T19:05Z');
const row={market:'points',playerId:'p',playerName:'Player',gameId:'g',gameTime:start,quoteVersion:1,quoteId:'q',sportsbook:'Book',sportsbookKey:'book',lineType:'main',sportsbookLine:10.5,overPrice:-110,underPrice:-110,quoteUpdatedAt:at,capturedAt:at,researchForecast:{status:'available',projection:12.3,modelSelection:{side:'OVER',line:10.5,price:-110,sportsbookKey:'book',quoteId:'q',calculatedAt:at}}};
const board={version:1,day:'2026-10-25',market:'points',capturedAt:at,lockAt:start,rows:[row]};
test('a current saved NBA pregame board displays the original forecast without waiting for regeneration',()=>{
 const result=currentNbaPregameSnapshot(board,'points','2026-10-25',now);assert.equal(result.rows.length,1);assert.equal(result.rows[0],row);assert.equal(result.rows[0].researchForecast.projection,12.3);assert.equal(result.boardFrozen,false);assert.equal(result.refreshing,true);
});
test('saved pregame display rejects expired prices, wrong dates, late captures, started slates and reported-out players',()=>{
 assert.equal(currentNbaPregameSnapshot(board,'points','2026-10-26',now),null);
 assert.equal(currentNbaPregameSnapshot({...board,capturedAt:start},'points','2026-10-25',now),null);
 assert.equal(currentNbaPregameSnapshot(board,'points','2026-10-25',Date.parse(start)),null);
 for(const patch of [{quoteUpdatedAt:'2026-10-25T18:00Z'},{gameTime:'2026-10-26T21:00Z'},{injuryStatus:'out'},{sportsbookLine:null}])assert.equal(currentNbaPregameSnapshot({...board,rows:[{...row,...patch}]},'points','2026-10-25',now),null);
});
