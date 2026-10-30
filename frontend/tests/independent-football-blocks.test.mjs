import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {loadIndependentFootballBlocks}=await loadTs(new URL('../lib/independent-football-blocks.ts',import.meta.url));
const block=(slate,n)=>({success:true,slate,slateLabel:slate,rows:Array.from({length:n},(_,i)=>({playerId:slate+i,rank:i+1,sportsbookLine:i+.5,overPrice:-110}))});
test('All combines 25 independently ranked players per block without a global cap or changed evidence',async()=>{
 const result=await loadIndependentFootballBlocks(async k=>block(k,25),()=>null);
 assert.equal(result.rows.length,75);assert.equal(result.complete,true);assert.deepEqual(result.blockCounts,{early:25,afternoon:25,evening:25});
 for(const key of ['early','afternoon','evening'])assert.deepEqual(result.rows.filter(r=>r.slateKey===key).map(r=>r.rank),Array.from({length:25},(_,i)=>i+1));
});
test('timed-out or failed blocks retain their saved board and original odds while smaller healthy blocks retain all players',async()=>{
 const saved=block('afternoon',25);const result=await loadIndependentFootballBlocks(async k=>k==='afternoon'?null:block(k,k==='early'?3:2),k=>k==='afternoon'?saved:null);
 assert.equal(result.rows.length,30);assert.equal(result.stale,true);assert.equal(result.complete,true);assert.deepEqual(result.blocks[1].rows,saved.rows);
 const failed=await loadIndependentFootballBlocks(async()=>{throw Error('provider failed')},k=>k==='afternoon'?saved:null);assert.equal(failed.rows.length,25);assert.deepEqual(failed.unavailableSlates,['early','evening']);
});
test('healthy empty blocks count as zero; missing blocks remain unknown and cannot be reported complete',async()=>{
 const result=await loadIndependentFootballBlocks(async k=>k==='early'?block(k,0):null,()=>null);
 assert.equal(result.complete,false);assert.deepEqual(result.blockCounts,{early:0,afternoon:null,evening:null});assert.deepEqual(result.unavailableSlates,['afternoon','evening']);
});
