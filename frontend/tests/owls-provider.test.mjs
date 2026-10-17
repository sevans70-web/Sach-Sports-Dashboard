import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {getOwlsPayload}=await loadTs(new URL('../lib/owls-provider.ts',import.meta.url));
test('markets share one successful feed request; billing failures enter cooldown without stale lines',async()=>{
 const original=globalThis.fetch,previous=process.env.OWLS_INSIGHT_API_KEY;process.env.OWLS_INSIGHT_API_KEY='test';let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return Response.json({data:[{id:'1'}]})};
  const result=await Promise.all([getOwlsPayload('nba'),getOwlsPayload('nba')]);assert.deepEqual(result[0],result[1]);assert.equal(calls,1);
  await getOwlsPayload('nba');assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;return new Response('billing unavailable',{status:403})};
  await assert.rejects(getOwlsPayload('soccer'),/403/);await assert.rejects(getOwlsPayload('soccer'),/403/);assert.equal(calls,2);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.OWLS_INSIGHT_API_KEY;else process.env.OWLS_INSIGHT_API_KEY=previous}
});
