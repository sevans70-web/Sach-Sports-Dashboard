import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
const root=await mkdtemp(path.join(tmpdir(),'nba-scope-'));process.env.SACH_HISTORY_DIR=root;
const {writeDurableHistory}=await loadTs(new URL('../lib/durable-history.ts',import.meta.url));
const {frozenNbaSlateBoard,readNbaSlateBoard}=await loadTs(new URL('../lib/nba-slate-board.ts',import.meta.url));
test('frozen NBA and hidden WNBA displays isolate dates and markets while retaining the exact source board',async()=>{
 try{
 for(const sport of ['nba','wnba']){
  const board={version:1,day:'2026-10-28',market:'points',capturedAt:'2026-10-28T20:00Z',lockAt:'2026-10-28T23:00Z',rows:[
   {playerId:'1',gameId:'today',market:'points',gameTime:'2026-10-29T00:00Z',rank:7,quoteId:'q-original',modelProjection:12},
   {playerId:'2',gameId:'previous',market:'points',gameTime:'2026-10-28T00:00Z',rank:8},
   {playerId:'3',gameId:'tomorrow',market:'points',gameTime:'2026-10-30T00:00Z',rank:9},
   {playerId:'4',gameId:'today',market:'assists',gameTime:'2026-10-29T00:00Z',rank:10}]};
  await writeDurableHistory(sport,'slate_board_points',board.day,[board]);
  const display=await frozenNbaSlateBoard('points',[],Date.parse('2026-10-29T02:00Z'),board.day,sport);
  assert.deepEqual(display.rows.map(r=>[r.playerId,r.gameId,r.rank,r.quoteId,r.modelProjection]),[['1','today',7,'q-original',12]]);
  assert.deepEqual(await readNbaSlateBoard('points',board.day,sport),board);
 }
 }finally{await rm(root,{recursive:true,force:true});}
});
