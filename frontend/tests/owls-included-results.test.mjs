import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {getOwlsIncludedResultsSample}=await loadTs(new URL('../lib/owls-provider.ts',import.meta.url));
test('included results use fixed documented queries, collapse requests and cache discovery plus one game',async()=>{
 const fetch=globalThis.fetch,key=process.env.OWLS_INSIGHT_API_KEY;const calls=[];
 process.env.OWLS_INSIGHT_API_KEY='test-only';
 globalThis.fetch=async(input,init)=>{
  const url=new URL(input);calls.push(url);assert.equal(init.headers.Authorization,'Bearer test-only');
  assert.equal(url.pathname,'/api/v1/nba/props/results');
  return Response.json(url.searchParams.has('date')?{data:{games:[{eventId:'nba:BOS@SAC-20260401'},{eventId:'nba:OTHER'}]}}:{data:{results:[{line:20.5}]}});
 };
 try{
  const [a,b]=await Promise.all([getOwlsIncludedResultsSample('nba'),getOwlsIncludedResultsSample('nba')]);
  assert.deepEqual(a,b);assert.equal(calls.length,2);assert.equal(a.gameId,'nba:BOS@SAC-20260401');
  assert.equal(calls[0].searchParams.get('date'),'2026-04-01');assert.equal(calls[1].searchParams.get('confirmed_only'),'true');assert.equal(calls[1].searchParams.get('category'),'points');
  await getOwlsIncludedResultsSample('nba');assert.equal(calls.length,2);
 }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OWLS_INSIGHT_API_KEY;else process.env.OWLS_INSIGHT_API_KEY=key}
});
test('permission denial stops the route, never escalates to another endpoint, and cools down',async()=>{
 const fetch=globalThis.fetch,key=process.env.OWLS_INSIGHT_API_KEY;let calls=0;
 process.env.OWLS_INSIGHT_API_KEY='test-only';globalThis.fetch=async(input)=>{calls++;assert.equal(new URL(input).pathname,'/api/v1/nfl/props/results');return new Response('secret body',{status:403})};
 try{
  for(let i=0;i<2;i++)await assert.rejects(getOwlsIncludedResultsSample('nfl'),{message:'Included prop results returned 403'});
  assert.equal(calls,1);
 }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OWLS_INSIGHT_API_KEY;else process.env.OWLS_INSIGHT_API_KEY=key}
});
