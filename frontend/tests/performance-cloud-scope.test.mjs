import test from 'node:test';import assert from 'node:assert/strict';import {checksum,listCloudPerformanceDocuments} from '../scripts/history-cloud.mjs';
test('all sports enumerate metadata, coalesce reads and isolate corrupt source documents',async()=>{
 const original=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;let metadataCalls=0,payloadCalls=0,active=0,maxActive=0;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
 const payload=[{actual:0,status:'hit'}],good={stream:'points',game_date:'2026-10-25',payload,checksum:checksum(payload)},bad={stream:'rebounds',game_date:'2026-10-25',payload,checksum:'bad'};
 globalThis.fetch=async(url,options)=>{
  const u=String(url);assert.ok(options.signal);active++;maxActive=Math.max(maxActive,active);await new Promise(r=>setTimeout(r,2));active--;
  if(u.includes('select=stream,game_date,checksum,source_bytes')){
   metadataCalls++;assert.match(u,/stream=not.like.featured_/);assert.match(u,/stream.like.protected_final_/);assert.match(u,/stream.like.protected_pregame_/);assert.doesNotMatch(u,/stream=not.like.slate_locked_/);
   return Response.json([good,bad].map(({payload,...meta})=>meta));
  }
  payloadCalls++;assert.match(u,/game_date=eq.2026-10-25&limit=1/);return Response.json([u.includes('stream=eq.points')?good:bad]);
 };
 try{
  const sports=['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb'];
  await Promise.all(sports.map(async sport=>{const [a,b]=await Promise.all([listCloudPerformanceDocuments(sport),listCloudPerformanceDocuments(sport)]);assert.deepEqual(a,b);assert.equal(a.rows[0].payload[0].actual,0);assert.deepEqual(a.errors,['rebounds|2026-10-25']);}));
  assert.equal(metadataCalls,8);assert.equal(payloadCalls,16);assert(maxActive<=2);
  await listCloudPerformanceDocuments('nba');assert.equal(payloadCalls,16);
 }finally{globalThis.fetch=original;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
