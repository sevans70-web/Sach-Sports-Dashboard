import test from 'node:test';import assert from 'node:assert/strict';import {runJobBudget} from '../jobs/budget.mjs';
const url=i=>'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/'+i+'/gamelog?season=2026',delay=ms=>new Promise(r=>setTimeout(r,ms));
function storage(){const cache=new Map();return {cache,cacheRead:u=>cache.get(u),cacheWrite:(u,v)=>{cache.set(u,v);return true;}};}
async function mocked(native,fn){const before=globalThis.fetch;globalThis.fetch=native;try{return await fn();}finally{globalThis.fetch=before;}}
test('budget pause drains admitted bodies; resumed attempt requests only unfinished inputs',async()=>{const store=storage();let hits=0,active=0,peak=0;
 await mocked(async()=>{hits++;active++;peak=Math.max(peak,active);return new Response(new ReadableStream({async start(c){await delay(5);c.enqueue(new TextEncoder().encode('{"games":[1]}'));c.close();active--;}}));},async()=>{
 let error;try{await runJobBudget({env:{},store,gate:async()=>0,cacheSources:true,limit:22},()=>Promise.all(Array.from({length:30},(_,i)=>fetch(url(i)).then(r=>r.json()))));}catch(e){error=e;}
 assert.equal(error.message,'job_subrequest_budget');assert.ok(error.usage.used<=22);assert.equal(active,0);assert.ok(store.cache.size>=6);assert.equal(hits,store.cache.size);assert.equal(peak,4);const first=hits;await delay(20);assert.equal(hits,first);
 const result=await runJobBudget({env:{},store,gate:async()=>0,cacheSources:true},()=>Promise.all(Array.from({length:30},(_,i)=>fetch(url(i)).then(r=>r.json()))));assert.equal(result.result.length,30);assert.equal(hits,30);assert.equal(result.usage.cacheHits,first);
 });});
test('duplicate public inputs coalesce without sharing consumed response bodies',async()=>{const store=storage();let hits=0,gates=0;
 await mocked(async()=>{hits++;await delay(5);return Response.json({games:[1]});},async()=>{const result=await runJobBudget({env:{},store,gate:async()=>{gates++;return 0;},cacheSources:true},()=>Promise.all(Array.from({length:30},()=>fetch(url(1)).then(r=>r.json()))));assert.equal(hits,1);assert.equal(gates,1);assert.equal(result.usage.coalesced,29);assert.equal(result.result.length,30);assert.equal(result.usage.cacheWrites,1);});});
test('request timeout cancels bodies and queued work without late HTTP or checkpoints',async()=>{const store=storage();let hits=0,cancelled=0;
 await mocked(async()=>{hits++;return new Response(new ReadableStream({cancel(){cancelled++;}}));},async()=>{await assert.rejects(runJobBudget({env:{},store,gate:async()=>0,cacheSources:true,requestTimeoutMs:15,deadlineMs:200},()=>Promise.all(Array.from({length:30},(_,i)=>fetch(url(i)).then(r=>r.json())))),/job_source_timeout/);const count=hits;await delay(30);assert.equal(hits,count);assert.equal(hits,4);assert.equal(cancelled,4);assert.equal(store.cache.size,0);});});
test('late provider RPC after phase cancellation cannot launch HTTP',async()=>{const store=storage();let hits=0,resolveGate;
 await mocked(async()=>{hits++;return Response.json({});},async()=>{const gate=new Promise(r=>resolveGate=r);await assert.rejects(runJobBudget({env:{},store,gate:()=>gate,cacheSources:true,deadlineMs:15},()=>Promise.all(Array.from({length:30},(_,i)=>fetch(url(i))))),/job_wall_deadline/);resolveGate(0);await delay(20);assert.equal(hits,0);assert.equal(store.cache.size,0);});});
test('429 persistence has reserved RPC capacity at budget edge and retries respect cooldown',async()=>{let hits=0,until=0;const store=storage();
 await mocked(async()=>{hits++;return new Response('{}',{status:429,headers:{'Retry-After':'120'}});},async()=>{let error;try{await runJobBudget({env:{},store,gate:async(_o,t)=>{until=Math.max(until,t||0);return until;},cacheSources:true,limit:3},()=>fetch(url(1)));}catch(e){error=e;}assert.equal(error.message,'provider_http_429');assert.equal(error.usage.used,3);assert.ok(until>=Date.now()+119000);assert.equal(hits,1);assert.equal(store.cache.size,0);await assert.rejects(runJobBudget({env:{},store,gate:async()=>until,cacheSources:true},()=>fetch(url(1))),/provider_cooldown/);assert.equal(hits,1);});});
test('each redirect hop is metered and cancellation reaches a streaming private database response',async()=>{
 let hits=0,cancelled=0;
 await mocked(async input=>{hits++;if(String(input).includes('gamelog'))return new Response(null,{status:302,headers:{Location:'https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/1/statistics'}});return Response.json({games:[1]});},async()=>{const result=await runJobBudget({env:{},store:storage(),gate:async()=>0,cacheSources:true},()=>fetch(url(1)).then(r=>r.json()));assert.equal(hits,2);assert.equal(result.usage.used,4);assert.equal(result.usage.costs.provider_gate,2);});
 await mocked(async()=>new Response(new ReadableStream({cancel(){cancelled++;}})),async()=>{await assert.rejects(runJobBudget({env:{},store:{},gate:async()=>0,requestTimeoutMs:15,deadlineMs:200},()=>fetch('https://db.supabase.co/rest/v1/worker_pregame_picks').then(r=>r.json())),/job_source_timeout/);assert.equal(cancelled,1);});
});

test('explicit manual/error redirect policies remain authoritative inside capture accounting',async()=>{for(const redirect of ['manual','error']){const store=storage();let hits=0;await mocked(async(_url,init)=>{hits++;assert.equal(init.redirect,'manual');return new Response('{}',{status:302,headers:{Location:'https://site.api.espn.com/redirected'}})},async()=>{if(redirect==='manual'){const result=await runJobBudget({env:{},store,gate:async()=>0,cacheSources:true},()=>fetch(url(44),{redirect}));assert.equal(result.result.status,302);assert.equal(result.usage.completedRequests,1)}else await assert.rejects(runJobBudget({env:{},store,gate:async()=>0,cacheSources:true},()=>fetch(url(44),{redirect})),/job_source_redirect_rejected/);assert.equal(hits,1);assert.equal(store.cache.size,0)})}});

test('a protected insert whose gate finishes at its dispatch cutoff never reaches the database',async()=>{
 const store=storage();
 let entered,release,hits=0;
 const waiting=new Promise(resolve=>{entered=resolve;});
 const gate=new Promise(resolve=>{release=resolve;});
 const originalNow=Date.now;
 const cutoff=originalNow()+1000;
 await mocked(async()=>{hits++;return new Response(null,{status:201});},async()=>{
  const attempt=runJobBudget({env:{},store,gate:()=>{entered();return gate;}},()=>fetch('https://db.supabase.co/rest/v1/history_documents',{method:'POST',sachNotAfter:cutoff}));
  try{
   await waiting;
   Date.now=()=>cutoff;
   release(0);
   await assert.rejects(attempt,{message:'nba_capture_board_locked'});
   assert.equal(hits,0);
   assert.equal(store.cache.size,0);
  }finally{Date.now=originalNow;release(0);}
 });
});

test('an expired grant blocks late bodies and does not impose its deadline on routine work',async()=>{
 const store=storage();
 const now=Date.now();
 const grant={day:'2026-11-27',lock:now+60000,expires:now+60,scheduleSha256:'a'.repeat(64)};
 let completeOld,hits=0,cancelled=0;
 await mocked(async()=>{
  hits++;
  if(hits===1)return new Response(new ReadableStream({
   start(controller){completeOld=()=>{try{controller.enqueue(new TextEncoder().encode('{}'));controller.close();}catch{}};},
   cancel(){cancelled++;},
  }));
  return Response.json({games:[1]});
 },async()=>{
  const options={env:{},store,gate:async()=>0,cacheSources:true};
  await assert.rejects(runJobBudget({...options,acceptance:grant},()=>fetch(url(1)).then(r=>r.json())),
   error=>error.message==='acceptance_closed'&&error.blocked===true);
  completeOld?.();
  assert.equal(cancelled,1);
  assert.equal(store.cache.size,0);
  await assert.rejects(runJobBudget({...options,acceptance:grant},()=>fetch(url(1))),{message:'acceptance_closed'});
  assert.equal(hits,1);
  const routine=await runJobBudget(options,()=>fetch(url(1)).then(r=>r.json()));
  assert.deepEqual(routine.result,{games:[1]});
  assert.equal(store.cache.size,1);
 });
});
