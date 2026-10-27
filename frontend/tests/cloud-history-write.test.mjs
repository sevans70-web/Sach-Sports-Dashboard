import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
import {checksum,saveCloudDocument} from '../scripts/history-cloud.mjs';
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('real cloud writer preserves concurrent history and verifies every distinct version',async t=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
 let rows=new Map(),writes=0,reads=0,fail=false,corrupt=false,active=0,maxActive=0;
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/rpc/write_history_document')){
   writes++;active++;maxActive=Math.max(active,maxActive);await tick();
   if(fail){active--;return new Response('',{status:503});}
   const b=JSON.parse(options.body);rows.set([b.p_sport,b.p_stream,b.p_day].join('|'),{payload:b.p_payload,checksum:b.p_checksum});return new Response(null,{status:204});
  }
  reads++;await tick();active--;
  const key=['sport','stream','game_date'].map(k=>u.searchParams.get(k).slice(3)).join('|');
  const row=rows.get(key);return Response.json(row?[{...row,checksum:corrupt?'bad':row.checksum}]:[]);
 };
 try{
  const api=await loadTs(new URL('../lib/cloud-history.ts',import.meta.url));
  await t.test('all eight sports use implicit timestamp coalescing through the real TS caller',async()=>{
   for(const sport of ['mlb','nfl','cfb','nba','wnba','nhl','soccer','cbb']){
    const before=writes;
    const saves=Array.from({length:20},()=>api.cloudHistoryWrite(sport,'points','2026-10-26',[{actual:8}]));
    await Promise.all(saves);assert.equal(writes-before,1);
   }
  });
  await t.test('distinct simultaneous versions serialize through checksum readback',async()=>{
   maxActive=0;await Promise.all([1,2,3].map(actual=>saveCloudDocument('nba','ordered','2026-10-26',[{actual}])));
   assert.equal(maxActive,1);assert.deepEqual(rows.get('nba|ordered|2026-10-26').payload,[{actual:3}]);
  });
  await t.test('separate route module instances share one verification queue',async()=>{
   const other=await import('../scripts/history-cloud.mjs?other-route');maxActive=0;
   await Promise.all([saveCloudDocument('nba','route_instances','2026-10-26',[1]),other.saveCloudDocument('nba','route_instances','2026-10-26',[2])]);
   assert.equal(maxActive,1);assert.deepEqual(rows.get('nba|route_instances|2026-10-26').payload,[2]);
  });
  await t.test('interleaved A B A preserves the final request',async()=>{
   const before=writes;await Promise.all([1,2,1].map(actual=>saveCloudDocument('nfl','interleaved','2026-10-26',[{actual}])));
   assert.equal(writes-before,3);assert.deepEqual(rows.get('nfl|interleaved|2026-10-26').payload,[{actual:1}]);
  });
  await t.test('caller mutation cannot change an in-flight payload',async()=>{
   const payload=[{actual:1}],work=saveCloudDocument('nba','snapshot','2026-10-26',payload);payload[0].actual=99;
   await work;assert.equal(rows.get('nba|snapshot|2026-10-26').payload[0].actual,1);
  });
  await t.test('explicit source versions stay independent and successes are not cached',async()=>{
   const before=writes;await Promise.all(['2026-10-26T01:00:00Z','2026-10-26T02:00:00Z'].map(time=>saveCloudDocument('nba','version','2026-10-26',[],0,time)));
   await saveCloudDocument('nba','version','2026-10-26',[],0,'2026-10-26T02:00:00Z');assert.equal(writes-before,3);
  });
  await t.test('failure and corruption reject; later calls retry',async()=>{
   fail=true;await assert.rejects(saveCloudDocument('nba','retry','2026-10-26',[]),/503/);fail=false;
   corrupt=true;await assert.rejects(saveCloudDocument('nba','retry','2026-10-26',[]),/checksum/);corrupt=false;
   assert.equal(await saveCloudDocument('nba','retry','2026-10-26',[]),true);
  });
  assert.ok(reads>0);for(const row of rows.values())assert.equal(checksum(row.payload),row.checksum);
 }finally{globalThis.fetch=oldFetch;for(const [key,value] of [['SUPABASE_URL',oldUrl],['SUPABASE_SECRET_KEY',oldKey]])if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
