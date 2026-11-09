import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {loadTs} from './load-ts.mjs';
const {protectHistory,replicateProtectedHistory}=await loadTs(new URL('../lib/protected-history.ts',import.meta.url));
test('original survives replacement attempts and cloud failure until verified retry',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-protected-')),day='2026-10-25',pick={player:'Original',market:'anytime_td',price:500,selectedAt:'2026-10-25T12:00Z'};
 try{await Promise.all([protectHistory('nfl','featured_original_long',day,pick,root),protectHistory('nfl','featured_original_long',day,{player:'Replacement'},root)]);
 const file=path.join(root,'nfl','protected_featured_original_long_'+day+'.json'),before=await readFile(file,'utf8');assert.deepEqual(JSON.parse(before)[0].payload,pick);
 const fail=await replicateProtectedHistory('nfl',root,8,async()=>{throw Error('cloud unavailable')});assert.equal(fail.pending,1);assert.equal(fail.verified,0);assert.equal(fail.errors.length,1);assert.equal(await readFile(file,'utf8'),before);
 let uploaded;const pass=await replicateProtectedHistory('nfl',root,8,async(sport,stream,day,rows)=>{uploaded=rows;return true;});assert.equal(pass.verified,1);assert.deepEqual(uploaded[0].payload,pick);assert.deepEqual(await readdir(path.join(root,'_system','protected-outbox')),[]);assert.equal(await readFile(file,'utf8'),before);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('all eight sports retain separate pregame and final receipts',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-all-sports-'));try{for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){await protectHistory(sport,'pregame_g_points','2026-10-25',{line:0.5,price:-110},root);await protectHistory(sport,'final_g','2026-10-25',{actual:0},root);assert.equal((await readdir(path.join(root,sport))).length,2);}}finally{await rm(root,{recursive:true,force:true});}
});

test('Worker receipts use a verified insert-only write with concurrent publishers', async()=>{
 const navigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const originalFetch=globalThis.fetch;
 const keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','SACH_ENABLE_WORKER_HISTORY_WRITES'];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 Object.defineProperty(globalThis,'navigator',{configurable:true,value:{userAgent:'Cloudflare-Workers'}});
 Object.assign(process.env,{SUPABASE_URL:'https://test.invalid',SUPABASE_SECRET_KEY:'test',SACH_ENABLE_WORKER_HISTORY_WRITES:'1'});
 let stored,posts=0;
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input);
  if(options.method==='POST'){
   posts++;
   assert.equal(options.headers.Prefer,'resolution=ignore-duplicates,return=minimal');
   assert.equal(url.searchParams.get('on_conflict'),'sport,stream,game_date');
   stored??=JSON.parse(options.body);
   return new Response(null,{status:201});
  }
  return Response.json([{payload:stored.payload,checksum:stored.checksum}]);
 };
 try{
  const day='2026-11-08';
  const first={line:12.5},replacement={line:14.5};
  const results=await Promise.all([protectHistory('nba','pregame_123_points',day,first),protectHistory('nba','pregame_123_points',day,replacement)]);
  assert.equal(posts,2);
  assert.equal(stored.stream,'protected_pregame_123_points');
  assert.deepEqual(results[0],results[1]);
  assert.deepEqual(results[0][0].payload,first);
  delete process.env.SACH_ENABLE_WORKER_HISTORY_WRITES;
  await assert.rejects(protectHistory('nba','pregame_123_points',day,replacement),/read-only/);
  assert.equal(posts,2);
 }finally{
  globalThis.fetch=originalFetch;
  if(navigator)Object.defineProperty(globalThis,'navigator',navigator);
  else delete globalThis.navigator;
  for(const key of keys)if(previous[key]===undefined)delete process.env[key];else process.env[key]=previous[key];
 }
});
