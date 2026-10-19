import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {getOwlsPayload,getOwlsArchiveValidationSample}=await loadTs(new URL('../lib/owls-provider.ts',import.meta.url));
test('markets share one successful feed request; billing failures enter cooldown without stale lines',async()=>{
 const original=globalThis.fetch,previous=process.env.OWLS_INSIGHT_API_KEY;process.env.OWLS_INSIGHT_API_KEY='test';let calls=0;
 try{
  globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return Response.json({data:[{id:'1'}]})};
  const result=await Promise.all([getOwlsPayload('nba'),getOwlsPayload('nba')]);assert.deepEqual(result[0],result[1]);assert.equal(calls,1);
  await getOwlsPayload('nba');assert.equal(calls,1);
  let requested='';globalThis.fetch=async url=>{requested=String(url);return Response.json({data:[]})};await getOwlsPayload('cbb');assert.match(requested,/\/ncaab\/props$/);
  globalThis.fetch=async()=>{calls++;return new Response('billing unavailable',{status:403})};
  await assert.rejects(getOwlsPayload('soccer'),/403/);await assert.rejects(getOwlsPayload('soccer'),/403/);assert.equal(calls,2);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.OWLS_INSIGHT_API_KEY;else process.env.OWLS_INSIGHT_API_KEY=previous}
});
test('model archive probe is fixed and bounded; concurrent calls share cache and provider denial is not an empty dataset',async()=>{
 const original=globalThis.fetch,previous=process.env.OWLS_INSIGHT_API_KEY;process.env.OWLS_INSIGHT_API_KEY='test';let calls=0;
 try{
  globalThis.fetch=async url=>{calls++;const u=new URL(url);assert.equal(u.pathname,'/api/v1/history/player-props');assert.equal(u.searchParams.get('limit'),'100');assert.equal(u.searchParams.get('isMain'),'true');assert.equal(u.searchParams.get('startDate'),'2026-04-01');return Response.json({data:[]})};
  await Promise.all([getOwlsArchiveValidationSample('nba'),getOwlsArchiveValidationSample('nba')]);assert.equal(calls,1);
  await getOwlsArchiveValidationSample('nba');assert.equal(calls,1);
  globalThis.fetch=async()=>{calls++;return new Response('unavailable',{status:429,headers:{'retry-after':'300'}})};
  await assert.rejects(getOwlsArchiveValidationSample('nfl'),/429/);await assert.rejects(getOwlsArchiveValidationSample('nfl'),/429/);assert.equal(calls,2);
 }finally{globalThis.fetch=original;if(previous===undefined)delete process.env.OWLS_INSIGHT_API_KEY;else process.env.OWLS_INSIGHT_API_KEY=previous}
});
