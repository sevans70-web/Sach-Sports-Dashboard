import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {sharedJsonRequest}=await loadTs(new URL('../lib/shared-json-request.ts',import.meta.url));
test('a failed prefetch cannot become a successful empty board for foreground navigation; retry remains possible',async()=>{
 const pending=new Map();let calls=0,reject;const read=()=>{calls++;return new Promise((_,r)=>{reject=r})};
 const prefetch=sharedJsonRequest(pending,'nba|rebounds',read);void prefetch.catch(()=>{});
 const foreground=sharedJsonRequest(pending,'nba|rebounds',read);assert.equal(prefetch,foreground);await Promise.resolve();reject(Error('provider timeout'));await assert.rejects(foreground,/provider timeout/);assert.equal(calls,1);assert.equal(pending.size,0);
 const rows={success:true,rows:[{playerId:'real'}]};assert.deepEqual(await sharedJsonRequest(pending,'nba|rebounds',async()=>rows),rows);assert.equal(pending.size,0);
});
test('simultaneous consumers share only their exact market/date URL across all eight sports',async()=>{
 for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb']){
 const pending=new Map();let calls=0;const read=async()=>({id:++calls});const a=sharedJsonRequest(pending,sport+'|points|today',read),b=sharedJsonRequest(pending,sport+'|points|today',read),c=sharedJsonRequest(pending,sport+'|pts_rebs|today',read),d=sharedJsonRequest(pending,sport+'|points|tomorrow',read);
 assert.equal(a,b);const results=await Promise.all([a,b,c,d]);assert.equal(calls,3);assert.equal(results[0],results[1]);assert.notDeepEqual(results[0],results[2]);assert.notDeepEqual(results[0],results[3]);assert.equal(pending.size,0);
 }
});
