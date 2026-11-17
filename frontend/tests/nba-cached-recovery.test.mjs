import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {loadTs} from './load-ts.mjs';
const {recoverNbaCachedBoard}=await loadTs(new URL('../lib/nba-cached-recovery.ts',import.meta.url));const {cachePregameBoard}=await loadTs(new URL('../lib/ranking-board-cache.ts',import.meta.url));
const board=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nba-points-recovery-2026-11-16.json.gz',import.meta.url)))),now=Date.parse(board.updatedAt)+1000,day=board.boardDay;
test('NBA provider outage recovery reads the exact existing pregame cache without rewriting forecasts or history',async()=>{
 const values=new Map(),cache={get:async k=>JSON.parse(values.get(k)||'null'),put:async(k,v)=>values.set(k,v)};await cachePregameBoard(cache,'nba','points',board,now);const before=JSON.stringify([...values]);
 const restored=await recoverNbaCachedBoard(cache,'points',day,now);assert.equal(restored.rows.length,25);assert.equal(restored.dataState,'stale');assert.ok(restored.coverageNotice);assert.equal(restored.observedAt,board.updatedAt);assert.equal(restored.evDiagnostics.available,25);assert.equal(JSON.stringify([...values]),before);assert.deepEqual(restored.rows.map(r=>r.researchForecast),board.rows.map(r=>r.researchForecast));
 await cachePregameBoard(cache,'nba','points',{...board,rows:[]},now);assert.equal(JSON.stringify([...values]),before,'empty refresh cannot replace the valid cache');
 assert.equal(await recoverNbaCachedBoard(cache,'points',day,now+10*60000),null);assert.equal(await recoverNbaCachedBoard(cache,'assists',day,now),null);assert.equal(await recoverNbaCachedBoard(cache,'points','2026-11-17',now),null);
});
test('NBA recovery rejects invalid quote/model evidence and started games without rewriting originals',async()=>{
 for(const patch of [{quoteUpdatedAt:'2026-11-01T00:00Z'},{gameTime:'2026-11-15T00:00Z'},{researchForecast:{status:'unavailable',reason:'recent_official_history_unavailable'}}]){
  const modified={...board,rows:board.rows.map(r=>({...r,...patch}))},entry={capturedAt:Date.parse(board.updatedAt),pregameOnly:true,board:modified},before=JSON.stringify(entry);assert.equal(await recoverNbaCachedBoard({get:async()=>entry},'points',day,now),null);assert.equal(JSON.stringify(entry),before);
 }
});
