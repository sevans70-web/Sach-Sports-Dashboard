import test from 'node:test';import assert from 'node:assert/strict';
import {runJobBudget,retryTime,cacheTtl} from '../jobs/budget.mjs';import {capturePhase,replayPhase,gradePhase} from '../jobs/tasks.mjs';import {saveImmutablePregameRows} from '../scripts/worker-pregame-capture.mjs';import {createHash} from 'node:crypto';
import {loadTs} from './load-ts.mjs';
test('capture accepts neither stale/post-start quotes nor a route failure as a successful reservation',async()=>{
 await assert.rejects(capturePhase({phase:'rank',sport:'nhl',market:'shots_on_goal'},{route:async()=>Response.json({success:false,rows:[]}),now:()=>Date.now()}),/rankings_unavailable/);
 const result=await capturePhase({phase:'rank',sport:'nhl',market:'shots_on_goal'},{route:async()=>Response.json({success:true,rows:[{gameTime:'2026-11-01',quoteVerified:true}]}),now:()=>Date.now()});assert.equal(result.eligible,0);
 let posts=0,expired=0;const env={SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'fixture'};
 const q={sport:'nhl',market:'shots_on_goal',game_date:'2026-11-01',game_time:'2026-11-01T00:00:00Z',game_id:'123',player_id:'456',checksum:'old'};
 const stored=await saveImmutablePregameRows(env,'worker_pregame_picks',[q],async(_url,init)=>{if(init.method==='POST')posts++;return Response.json([]);},{requirePregame:true,onExpired:()=>expired++});assert.equal(stored,0);assert.equal(posts,0);assert.equal(expired,1);
 // An ACK-lost original already stored before the start is retained on recovery.
 await saveImmutablePregameRows(env,'worker_pregame_picks',[q],async()=>Response.json([{game_id:'123',player_id:'456',checksum:'first'}]),{requirePregame:true,onExpired:()=>assert.fail('existing evidence is not a new expired write')});
});
test('budget deadline cancels orphan requests, while ordinary foreground fetch remains usable',async()=>{
 const native=globalThis.fetch;let aborted=false;globalThis.fetch=async(_input,init)=>new Promise((resolve,reject)=>{if(!init?.signal){resolve(Response.json({foreground:true}));return;}init.signal.addEventListener('abort',()=>{aborted=true;reject(init.signal.reason);},{once:true});});
 try{await assert.rejects(runJobBudget({env:{},store:{},gate:async()=>0,deadlineMs:30},async()=>fetch('https://fixture.test/source')),/job_wall_deadline/);assert.equal(aborted,true);assert.equal((await fetch('https://fixture.test/foreground').then(r=>r.json())).foreground,true);}finally{globalThis.fetch=native;}
});
test('Retry-After never shortens provider limits; only public historical inputs are eligible for cache',()=>{
 const t=Date.now();assert.equal(retryTime('120',t),t+120000);assert.equal(retryTime('1',t),t+60000);assert.equal(retryTime(null,t),t+60000);
 assert.equal(cacheTtl('https://api-web.nhle.com/v1/gamecenter/1/boxscore'),0);assert.equal(cacheTtl('https://api.owlsinsight.com/api/v1/nhl/props'),0);assert.equal(cacheTtl('https://api-web.nhle.com/v1/player/1/game-log/20262027/2'),900000);
});
test('recent replay checkpoints complete verified pages beyond 900 documents and targets one official game',async()=>{
 const native=globalThis.fetch,rows=Array.from({length:1001},(_,i)=>{const payload=[{payload:{}}];return {game_date:'2026-11-14',stream:'protected_final_'+String(i).padStart(5,'0'),payload,checksum:createHash('sha256').update(JSON.stringify(payload)).digest('hex')};}),docs=new Map();
 globalThis.fetch=async url=>{const u=new URL(url),after=u.searchParams.get('stream')?.slice(3)||'';return Response.json(rows.filter(r=>r.stream>after).slice(0,150));};
 try{let job={id:'replay',kind:'replay',sport:'nhl',day:'2026-11-14',phase:'scan',cursor:''};const services={env:{SUPABASE_URL:'https://db.test',SUPABASE_SECRET_KEY:'fixture'},store:{document:(_id,key,value)=>docs.set(key,value)}};
  for(let i=0;i<7;i++)job=await replayPhase(job,services);assert.equal(job.phase,'game');assert.equal(docs.size,1001);
  rows[0].checksum='bad';await assert.rejects(replayPhase({...job,phase:'scan',cursor:''},services),/checksum mismatch/);assert.equal(docs.size,1001);
  const {createWorkerGradingReplay}=await loadTs(new URL('../lib/worker-grading-replay.ts',import.meta.url));const replay=createWorkerGradingReplay('nhl');
  for(const id of ['101','102','103'])replay.consume({stream:'protected_final_test',payload:[{payload:{kind:'official_final_checkpoint',source:'official_final_boxscore',gameId:id,boxscore:{success:true,gameId:id,state:'off',rows:[{playerId:'1',stats:{shots_on_goal:2}}]}}}]});
  assert.deepEqual(replay.gameIds(),['101','102','103']);let requested=[];await replay.verify(async path=>{requested.push(path);return Response.json({success:true,gameId:'103',state:'off',rows:[{playerId:'1',stats:{shots_on_goal:2}}]});},undefined,0,'103');assert.equal(requested.length,1);assert.ok(requested[0].endsWith('gameId=103'));
 }finally{globalThis.fetch=native;}
});
test('unavailable official game is recorded and cannot starve later games on the same page',async()=>{
 const events=[];const next=await gradePhase({id:'grade',phase:'game',sport:'nhl',games:['1','2'],gameCursor:0},{route:async()=>new Response('{}',{status:503}),now:()=>1,store:{document:(_id,key,value)=>events.push({key,value})}});
 assert.equal(next.gameCursor,1);assert.equal(next.unavailable,1);assert.equal(events[0].value.status,503);
});
test('background ranking results and pending builds cannot poison a concurrent foreground board',async()=>{
 const {rankingResponse}=await loadTs(new URL('../lib/ranking-response-cache.ts',import.meta.url));let release;
 const held=new Promise(resolve=>release=resolve),key='nhl|job-isolation-'+Date.now();let started;const entered=new Promise(resolve=>started=resolve);
 const background=runJobBudget({env:{},store:{},gate:async()=>0},()=>rankingResponse(key,async()=>{started();await held;return {success:true,rows:[{gameTime:new Date(Date.now()+3600000).toISOString(),origin:'background'}]};}));
 await entered;const foreground=await rankingResponse(key,async()=>({success:true,rows:[{gameTime:new Date(Date.now()+3600000).toISOString(),origin:'foreground'}]}));assert.equal(foreground.rows[0].origin,'foreground');release();await background;
 const cached=await rankingResponse(key,()=>assert.fail('foreground board should remain cached'));assert.equal(cached.rows[0].origin,'foreground');
});
