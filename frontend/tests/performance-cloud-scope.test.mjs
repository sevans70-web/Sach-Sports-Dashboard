import test from 'node:test';import assert from 'node:assert/strict';import {checksum,cloudRequest,listCloudPerformanceDocuments,saveCloudDocument,visitCloudPerformanceDocuments} from '../scripts/history-cloud.mjs';
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

test('Workers read many saved documents in bounded day batches and isolate a corrupt checksum', async () => {
 const originalFetch = globalThis.fetch;
 const oldUrl = process.env.SUPABASE_URL;
 const oldKey = process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL = 'https://test.invalid';
 process.env.SUPABASE_SECRET_KEY = 'test';
 const payload = [{actual:0, status:'hit'}];
 const docs = Array.from({length:250}, (_, i) => ({
  stream: 'points_' + i,
  game_date: i < 150 ? '2026-10-25' : '2026-10-24',
  source_bytes: 32 * 1024,
  checksum: i === 149 ? 'corrupt' : checksum(payload),
  payload,
 }));
 let requests = 0;
 globalThis.fetch = async input => {
  requests++;
  const query = new URL(input).searchParams;
  if(query.get('select') === 'stream,game_date,source_bytes'){
   const offset = Number(query.get('offset'));
   return Response.json(docs.slice(offset, offset + 200).map(({payload, checksum, ...meta}) => meta));
  }
  const streams = query.get('stream').slice(4, -1).split(',');
  const day = query.get('game_date').slice(3);
  assert(streams.length <= 24);
  return Response.json(docs.filter(doc => doc.game_date === day && streams.includes(doc.stream)));
 };
 try {
  const visited = [];
  const result = await visitCloudPerformanceDocuments('nba', '2026-10-24', row => visited.push(row.stream));
  assert.equal(visited.length, 249);
  assert.equal(result.documents, 249);
  assert.deepEqual(result.dates, ['2026-10-25','2026-10-24']);
  assert.deepEqual(result.errors, ['points_149|2026-10-25:invalid']);
  assert.equal(requests, 14);
 } finally {
  globalThis.fetch = originalFetch;
  if(oldUrl === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = oldUrl;
  if(oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
  else process.env.SUPABASE_SECRET_KEY = oldKey;
 }
});

test('staging Workers reject shared history writes before making a network request', async () => {
 const navigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
 const allowWrites = process.env.SACH_ENABLE_WORKER_HISTORY_WRITES;
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Cloudflare-Workers'}});
 delete process.env.SACH_ENABLE_WORKER_HISTORY_WRITES;
 try {
  assert.equal(await saveCloudDocument('nba','points','2026-11-09',[]),false);
  await assert.rejects(cloudRequest('history_archive_files',{method:'POST'}),/read-only/);
 } finally {
  if(navigator)Object.defineProperty(globalThis,'navigator',navigator);
  else delete globalThis.navigator;
  if(allowWrites!==undefined)process.env.SACH_ENABLE_WORKER_HISTORY_WRITES=allowWrites;
 }
});
