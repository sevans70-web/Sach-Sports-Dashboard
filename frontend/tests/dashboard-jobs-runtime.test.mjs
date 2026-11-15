import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {rolldown} from 'rolldown';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
const now=Date.now(),start=new Date(now+7200000).toISOString();
const row=(id=123)=>({gameId:'2026020999',playerId:String(id),playerName:'Fixture Player '+id,gameTime:start,quoteVerified:true,quoteVersion:1,marketBacked:true,quoteUpdatedAt:new Date(now-1000).toISOString(),quoteId:'quote-'+id,sportsbookKey:'fixture',sportsbook:'Fixture',sportsbookLine:2.5,overPrice:100,underPrice:-120,lineType:'total',prediction:'OVER',researchForecast:{modelSelection:{side:'OVER',line:2.5,price:100,quoteId:'quote-'+id,sportsbookKey:'fixture',calculatedAt:new Date(now).toISOString()}}});
const key=r=>[r.sport,r.market,r.game_id,r.player_id].join('|');
async function setup(dir,answer){const file=join(dir,'worker.mjs');const b=await rolldown({input:resolve('tests/fixtures/dashboard-jobs-runtime.mjs'),external:['cloudflare:workers',/^node:/],platform:'neutral'});await b.write({file,format:'esm'});await b.close();
 const options=convertV4MiniflareOptions({name:'dashboard-test',modules:true,modulesRoot:dir,scriptPath:file,compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],durableObjects:{DASHBOARD_JOBS:{className:'DashboardJobQueue',useSQLite:true}},kvNamespaces:['VINEXT_KV_CACHE'],resourcePersistencePath:join(dir,'storage'),bindings:{SUPABASE_URL:'https://db.supabase.co',SUPABASE_SECRET_KEY:'synthetic-fixture-only'},outboundService:answer});options.workers[0].config.limits={subrequests:350,cpuMs:30000};const mf=new Miniflare(options);
 const call=async(action,value,lane='capture:nhl')=>{const r=await mf.dispatchFetch('https://test.local/control',{method:'POST',body:JSON.stringify({action,value,lane})});assert.equal(r.status,200,await r.clone().text());return r.json();};return {mf,call};}
test('independent durable lanes resume over-budget capture, survive restart and preserve original receipts after lost acknowledgements',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-runtime-'));let runtime;let histories=0,ackLoss=true;const tables={worker_pregame_originals:new Map(),worker_pregame_picks:new Map()};
 const answer=async req=>{const u=new URL(req.url);
  if(u.hostname==='fixture.test')return Response.json({histories:u.searchParams.get('market')==='q1_passing_yards'?125:0,rows:[row()]});
  if(u.hostname==='api-web.nhle.com'){histories++;return Response.json({gameLog:[]});}
  if(u.hostname==='db.supabase.co'){const table=tables[u.pathname.split('/').at(-1)];assert.ok(table);
   if(req.method==='POST'){const input=await req.json();for(const r of input)if(!table.has(key(r)))table.set(key(r),{...r,captured_at:new Date().toISOString()});if(ackLoss){ackLoss=false;return new Response('{}',{status:503});}return new Response(null,{status:201});}
   return Response.json([...table.values()].filter(r=>r.sport===u.searchParams.get('sport')?.slice(3)&&r.market===u.searchParams.get('market')?.slice(3)));}
  throw Error('unexpected host '+u.hostname);};
 try{runtime=await setup(dir,answer);let {mf,call}=runtime;const job=(sport,market,id)=>({kind:'capture',sport,market,id,created:now});
  await call('clock',now+300000,'capture:nfl');await call('clock',now+300000);await call('clock',now+300000,'capture:nba');
  await call('enqueue',job('nfl','q1_passing_yards','nfl-budget'),'capture:nfl');await call('enqueue',job('nhl','shots_on_goal','nhl-shot'));await call('enqueue',job('nba','points','nba-points'),'capture:nba');
  const [nfl,foreground]=await Promise.all([call('step',null,'capture:nfl'),mf.dispatchFetch('https://test.local/foreground')]);
  assert.equal(foreground.status,200);assert.equal(nfl.jobs[0].lastError,'job_subrequest_budget');assert.equal(nfl.jobs[0].phase,'rank');assert.equal(nfl.jobs[0].usage.used,218);assert.equal(histories,108);assert.equal((await call('inspect',null,'capture:nfl')).cache.length,108);
  await call('step');let s=await call('step');assert.equal(s.jobs[0].lastError,'Cloudflare pregame storage HTTP 503');const original=[...tables.worker_pregame_originals.values()][0];assert.equal(original.market,'shots_on_goal');await call('step',null,'capture:nba');
  const retry=s.jobs[0].retryAt;await mf.dispose();runtime=await setup(dir,answer);({mf,call}=runtime);await call('clock',retry+1);for(let i=0;i<7;i++){await call('clock',retry+1001+i*1001);s=await call('step');}
  assert.equal(s.jobs[0].state,'done');assert.ok((await call('inspect')).events.some(e=>e.outcome==='deferred'));assert.equal(tables.worker_pregame_originals.size,1);assert.equal(tables.worker_pregame_picks.size,1);assert.equal([...tables.worker_pregame_originals.values()][0].checksum,original.checksum);
  let n=await call('inspect',null,'capture:nfl');await call('clock',n.status.jobs[0].retryAt+1,'capture:nfl');n=await call('step',null,'capture:nfl');assert.equal(n.jobs[0].phase,'originals');assert.ok(n.jobs[0].usage.cacheHits>=108);assert.equal(histories,125);
  await call('enqueue',job('nfl','q1_passing_yards','new-tick'),'capture:nfl');assert.equal((await call('inspect',null,'capture:nfl')).status.jobs.length,1);
  await call('lease',{token:'another-owner',until:now+1000000},'capture:nba');const before=await call('inspect',null,'capture:nba');await Promise.all([call('step',null,'capture:nba'),call('step',null,'capture:nba')]);assert.deepEqual((await call('inspect',null,'capture:nba')).docs,before.docs);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}});
test('persistent provider cooldown prevents retries across sports until Retry-After expires',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-cooldown-'));let runtime,limited=true,hits=0;
 const answer=async req=>{const u=new URL(req.url);if(u.hostname==='fixture.test')return Response.json({histories:1,rows:[row()]});if(u.hostname==='api-web.nhle.com'){hits++;if(limited){limited=false;return new Response('{}',{status:429,headers:{'Retry-After':'120'}});}return Response.json({gameLog:[]});}throw Error('unexpected host');};
 try{runtime=await setup(dir,answer);let {mf,call}=runtime;
  for(const sport of ['nhl','nfl']){await call('clock',now+300000,'capture:'+sport);await call('enqueue',{kind:'capture',sport,market:sport==='nhl'?'shots_on_goal':'q1_passing_yards',id:sport+'-cooldown',created:now},'capture:'+sport);}
  let s=await call('step');assert.equal(s.jobs[0].lastError,'provider_http_429');const due=s.jobs[0].retryAt;
  s=await call('step',null,'capture:nfl');assert.equal(s.jobs[0].lastError,'provider_cooldown');assert.equal(hits,1);
  await mf.dispose();runtime=await setup(dir,answer);({mf,call}=runtime);await call('alarm');assert.equal(hits,1);await call('clock',due+1);s=await call('step');assert.equal(s.jobs[0].phase,'originals');assert.equal(hits,2);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('all eligible NHL shots, points, assists and saves survive chunked capture without the former 75-row truncation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-coverage-'));let runtime;const tables={worker_pregame_originals:new Map(),worker_pregame_picks:new Map()};
 const answer=async req=>{const u=new URL(req.url);if(u.hostname==='fixture.test')return Response.json({rows:[...Array.from({length:81},(_,i)=>row(1000+i)),row(1000),{...row(999),quoteVerified:false}]});
  if(u.hostname==='db.supabase.co'){const table=tables[u.pathname.split('/').at(-1)];if(req.method==='POST'){for(const r of await req.json())if(!table.has(key(r)))table.set(key(r),r);return new Response(null,{status:201});}return Response.json([...table.values()].filter(r=>r.market===u.searchParams.get('market')?.slice(3)));}throw Error('unexpected host');};
 try{runtime=await setup(dir,answer);const {call}=runtime;await call('clock',now+300000);
  for(const market of ['shots_on_goal','points','assists','goalie_saves']){await call('enqueue',{kind:'capture',sport:'nhl',market,id:market,created:now});for(let i=0;i<10;i++)await call('step');}
  const s=await call('inspect');assert.ok(s.status.jobs.every(j=>j.state==='done'&&j.eligible===81));assert.equal(tables.worker_pregame_originals.size,324);assert.equal(tables.worker_pregame_picks.size,324);assert.ok([...tables.worker_pregame_originals.values()].every(q=>q.player_id!=='999'));assert.equal(s.docs.length,4);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('grading scans beyond 250 picks and ignores unrelated grades without starving later pages',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-grading-'));let runtime;const captured=new Date(now-7200000).toISOString(),time=new Date(now-5400000).toISOString();
 const picks=Array.from({length:271},(_,i)=>({sport:'nhl',market:'shots_on_goal',game_id:'2026020888',player_id:String(1000+i),game_date:time.slice(0,10),game_time:time,captured_at:captured,prediction_side:'OVER',sportsbook_line:2.5,checksum:'checksum-'+i,payload:{modelSelection:{side:'OVER',line:2.5,price:100,quoteId:'q'+i,sportsbookKey:'fixture',calculatedAt:captured},quote:{quoteId:'q'+i,sportsbookKey:'fixture',overPrice:100,underPrice:-120}}}));
 const grades=new Map(Array.from({length:1001},(_,i)=>['old-'+i,{sport:'nhl',game_id:'999',player_id:String(i),market:'shots_on_goal'}]));let postLoss=true;
 const answer=async req=>{const u=new URL(req.url);if(u.hostname==='official.test')return Response.json({success:true,gameId:'2026020888',state:'off',rows:picks.map(p=>({playerId:p.player_id,stats:{shots_on_goal:3}}))});
  if(u.pathname.endsWith('/worker_pregame_picks'))return Response.json(picks.slice(Number(u.searchParams.get('offset')),Number(u.searchParams.get('offset'))+50));
  if(u.pathname.endsWith('/worker_pregame_grades')){if(req.method==='POST'){for(const g of await req.json())if(!grades.has(key(g)))grades.set(key(g),g);if(postLoss){postLoss=false;return new Response('{}',{status:503});}return new Response(null,{status:201});}
   const ids=new Set((u.searchParams.get('player_id')||'').replace('in.(','').slice(0,-1).split(','));return Response.json([...grades.values()].filter(g=>g.game_id===u.searchParams.get('game_id')?.slice(3)&&ids.has(g.player_id)));}throw Error('unexpected source');};
 try{runtime=await setup(dir,answer);let {mf,call}=runtime;await call('clock',now+300000,'grade:nhl');await call('enqueue',{kind:'grade',sport:'nhl',id:'grade-all',created:now},'grade:nhl');let s;
  for(let i=0;i<50;i++){s=await call('step',null,'grade:nhl');if(s.jobs[0].lastError){assert.equal(s.jobs[0].phase,'write');await mf.dispose();runtime=await setup(dir,answer);({mf,call}=runtime);}if(s.jobs[0].state==='done')break;}
  assert.equal(s.jobs[0].state,'done');assert.equal(s.jobs[0].cursor,271);assert.equal(grades.size,1272);assert.ok([...grades.values()].filter(g=>g.game_id==='2026020888').every(g=>g.result_status==='hit'&&g.actual===3));
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('scheduled delivery is idempotent and does no ranking or grading work in the cron invocation',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-tick-'));let runtime,hits=0;
 try{runtime=await setup(dir,()=>{hits++;return Response.json({});});const worker=await runtime.mf.getWorker(),time=now+600000;
  await worker.scheduled({cron:'*/2 * * * *',scheduledTime:time});await worker.scheduled({cron:'*/2 * * * *',scheduledTime:time});assert.equal(hits,0);
  const {CAPTURE_MARKETS,marketsForCaptureTick}=await import('../scripts/worker-pregame-capture.mjs');const markets=marketsForCaptureTick(time);assert.equal(markets.length,2);
  for(const {sport,market} of markets){const s=await runtime.call('inspect',null,'capture:'+sport);assert.equal(s.status.jobs.filter(j=>j.market===market).length,1);}
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('180 concurrent cold NFL inputs checkpoint before a budget pause, resume after eviction, and cannot starve NBA/NHL',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-parallel-'));let runtime,active=0,peak=0,histories=0;const tables={worker_pregame_originals:new Map(),worker_pregame_picks:new Map()};
 const answer=async req=>{const u=new URL(req.url);
  if(u.hostname==='fixture.test')return Response.json({parallel:u.searchParams.get('sport')==='nfl'?180:0,rows:[row()]});
  if(u.hostname==='site.web.api.espn.com'){
   histories++;active++;peak=Math.max(peak,active);let ended=false,timer;const end=()=>{if(!ended){ended=true;active--;}};
   return new Response(new ReadableStream({start(c){timer=setTimeout(()=>{c.enqueue(new TextEncoder().encode(JSON.stringify({gameLog:[{fixture:u.pathname}]})));c.close();end();},20);},cancel(){clearTimeout(timer);end();}}),{headers:{'Content-Type':'application/json'}});
  }
  if(u.hostname==='db.supabase.co'){const table=tables[u.pathname.split('/').at(-1)];if(req.method==='POST'){for(const r of await req.json())if(!table.has(key(r)))table.set(key(r),r);return new Response(null,{status:201});}return Response.json([...table.values()].filter(r=>r.sport===u.searchParams.get('sport')?.slice(3)&&r.market===u.searchParams.get('market')?.slice(3)));}
  throw Error('unexpected source '+u.hostname);
 };
 try{runtime=await setup(dir,answer);let {mf,call}=runtime;
  for(const [sport,market] of [['nfl','receiving_yards'],['nba','points'],['nhl','shots_on_goal']]){await call('clock',now+300000,'capture:'+sport);await call('enqueue',{kind:'capture',sport,market,id:sport+'-parallel',created:now},'capture:'+sport);}
  let first=await call('step',null,'capture:nfl');let job=first.jobs[0];assert.equal(job.phase,'rank');assert.equal(job.lastError,'job_subrequest_budget');assert.ok(job.usage.used<=220);assert.equal(job.usage.maxActive,4);assert.ok(job.usage.maxReserved<=12);assert.ok(job.progress.sourceCheckpoints>=100);assert.equal(job.progress.needsAttention,false);assert.equal(active,0);assert.ok(peak<=4);
  const saved=(await call('inspect',null,'capture:nfl')).cache.length,networkAtPause=histories;assert.equal(saved,networkAtPause);await new Promise(r=>setTimeout(r,60));assert.equal(histories,networkAtPause,'cancelled queue cannot launch HTTP work after return');
  const foreground=await mf.dispatchFetch('https://test.local/foreground');assert.equal(foreground.status,200);
  for(const sport of ['nba','nhl']){let state;for(let i=0;i<4;i++)state=await call('step',null,'capture:'+sport);assert.equal(state.jobs[0].state,'done');}
  await mf.dispose();runtime=await setup(dir,answer);({mf,call}=runtime);assert.equal((await call('inspect',null,'capture:nfl')).cache.length,saved);
  job=(await call('step',null,'capture:nfl')).jobs[0];assert.equal(job.phase,'originals');assert.ok(job.usage.cacheHits>=saved);assert.equal(job.progress.sourceCheckpoints,180);assert.equal(histories,180,'completed inputs are not requested again after eviction');assert.equal(active,0);
  for(let i=0;i<4;i++)job=(await call('step',null,'capture:nfl')).jobs[0];assert.equal(job.state,'done');assert.equal(tables.worker_pregame_picks.size,3);assert.equal(tables.worker_pregame_originals.size,3);
  const events=(await call('inspect',null,'capture:nfl')).events;assert.ok(events.every(e=>JSON.parse(e.detail).usage.used<=220));console.log(JSON.stringify({proof:'cold_parallel_forward_progress',firstCheckpointed:saved,totalInputs:histories,maxConcurrentSources:peak,sourceCheckpoints:job.progress.sourceCheckpoints,allThreeSportsStoredOnce:tables.worker_pregame_picks.size}));
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
test('repeated unavailable NFL inputs are flagged and backed off without starving other markets or grading',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-stalled-'));let runtime;
 const answer=async req=>{const u=new URL(req.url);if(u.hostname==='fixture.test')return Response.json({histories:u.searchParams.get('market')==='receiving_yards'?1:0,rows:[row()]});if(u.hostname==='api-web.nhle.com')return new Response('{}',{status:503});if(u.pathname.endsWith('worker_pregame_picks'))return Response.json([]);throw Error('unexpected source');};
 try{runtime=await setup(dir,answer);const {call}=runtime;await call('clock',now+300000,'capture:nfl');await call('enqueue',{kind:'capture',sport:'nfl',market:'receiving_yards',id:'blocked',created:now},'capture:nfl');
 let job;for(let i=0;i<3;i++)job=(await call('step',null,'capture:nfl')).jobs.find(j=>j.id==='blocked');assert.equal(job.progress.stalledAttempts,3);assert.equal(job.progress.needsAttention,true);assert.equal(job.progress.sourceCheckpoints,0);assert.equal(job.lastError,'job_source_http_503');assert.ok(job.retryAt>=job.created+15*60000);
 await call('enqueue',{kind:'capture',sport:'nfl',market:'passing_yards',id:'other-market',created:now},'capture:nfl');const other=(await call('step',null,'capture:nfl')).jobs.find(j=>j.id==='other-market');assert.equal(other.phase,'originals');assert.equal(other.progress.stalledAttempts,0);
 await call('clock',now+300000,'grade:nfl');await call('enqueue',{kind:'grade',sport:'nfl',id:'grade-independent',created:now},'grade:nfl');assert.equal((await call('step',null,'grade:nfl')).jobs[0].state,'done');assert.equal((await call('inspect',null,'capture:nfl')).cache.length,0);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
