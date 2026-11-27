import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {rolldown} from 'rolldown';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {capturePhase} from '../jobs/tasks.mjs';
import {checksum} from '../scripts/history-cloud.mjs';
const now=Date.now(),start=new Date(now+7200000).toISOString();
const row=(id=123)=>({gameId:'2026020999',playerId:String(id),playerName:'Fixture Player '+id,gameTime:start,quoteVerified:true,quoteVersion:1,marketBacked:true,quoteUpdatedAt:new Date(now-1000).toISOString(),quoteId:'quote-'+id,sportsbookKey:'fixture',sportsbook:'Fixture',sportsbookLine:2.5,overPrice:100,underPrice:-120,lineType:'total',prediction:'OVER',researchForecast:{modelSelection:{side:'OVER',line:2.5,price:100,quoteId:'quote-'+id,sportsbookKey:'fixture',calculatedAt:new Date(now).toISOString()}}});
const key=r=>[r.sport,r.market,r.game_id,r.player_id].join('|');
async function setup(dir,answer,operatorBindings){const file=join(dir,'worker.mjs');const b=await rolldown({input:resolve('tests/fixtures/dashboard-jobs-runtime.mjs'),external:['cloudflare:workers',/^node:/],platform:'neutral'});await b.write({file,format:'esm'});await b.close();
 const options=convertV4MiniflareOptions({name:'dashboard-test',modules:true,modulesRoot:dir,scriptPath:file,compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],durableObjects:{DASHBOARD_JOBS:{className:'DashboardJobQueue',useSQLite:true}},kvNamespaces:['VINEXT_KV_CACHE'],resourcePersistencePath:join(dir,'storage'),bindings:{SUPABASE_URL:'https://db.supabase.co',SUPABASE_SECRET_KEY:'synthetic-fixture-only',...operatorBindings},outboundService:answer});
 if(operatorBindings){
  const caller=convertV4MiniflareOptions({name:'operator-fixture',modules:true,
   script:`export default {async fetch(request,env){
    try{return Response.json(await env.OPERATOR.acceptNbaPoints(await request.json()));}
    catch(error){return Response.json({error:error.message},{status:409});}
   }}`,compatibilityDate:'2026-11-06',
   serviceBindings:{OPERATOR:{name:'dashboard-test',entrypoint:'NbaAcceptanceOperator'}}});
  options.workers.push(...caller.workers);
 }
 const mf=new Miniflare(options);
 const call=async(action,value,lane='capture:nhl')=>{const r=await mf.dispatchFetch('https://test.local/control',{method:'POST',body:JSON.stringify({action,value,lane})});assert.equal(r.status,200,await r.clone().text());return r.json();};return {mf,call};}
test('independent durable lanes resume over-budget capture, survive restart and preserve original receipts after lost acknowledgements',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-runtime-'));let runtime;let histories=0,ackLoss=true;const tables={worker_pregame_originals:new Map(),worker_pregame_picks:new Map()};
 const answer=async req=>{const u=new URL(req.url);
  if(u.hostname==='fixture.test')return Response.json({histories:u.searchParams.get('market')==='q1_passing_yards'?125:0,parallelHistories:true,rows:[row()]});
  if(u.hostname==='api-web.nhle.com'){
   histories++;
   return new Response(new ReadableStream({async start(stream){
    await new Promise(done=>setTimeout(done,2));stream.enqueue(new TextEncoder().encode('{"gameLog":[]}'));stream.close();
   }}));
  }
  if(u.hostname==='db.supabase.co'){const table=tables[u.pathname.split('/').at(-1)];assert.ok(table);
   if(req.method==='POST'){const input=await req.json();for(const r of input)if(!table.has(key(r)))table.set(key(r),{...r,captured_at:new Date().toISOString()});if(ackLoss){ackLoss=false;return new Response('{}',{status:503});}return new Response(null,{status:201});}
   return Response.json([...table.values()].filter(r=>r.sport===u.searchParams.get('sport')?.slice(3)&&r.market===u.searchParams.get('market')?.slice(3)));}
  throw Error('unexpected host '+u.hostname);};
 try{runtime=await setup(dir,answer);let {mf,call}=runtime;const job=(sport,market,id)=>({kind:'capture',sport,market,id,created:now});
  await call('clock',now+300000,'capture:nfl');await call('clock',now+300000);await call('clock',now+300000,'capture:nba');
  await call('enqueue',job('nfl','q1_passing_yards','nfl-budget'),'capture:nfl');await call('enqueue',job('nhl','shots_on_goal','nhl-shot'));assert.equal((await call('enqueue',job('nba','points','nba-points'),'capture:nba')).reason,'nba_routine_held');
  const [nfl,foreground]=await Promise.all([call('step',null,'capture:nfl'),mf.dispatchFetch('https://test.local/foreground')]);
  assert.equal(foreground.status,200);assert.equal(nfl.jobs[0].lastError,'job_subrequest_budget');assert.equal(nfl.jobs[0].phase,'rank');assert.ok(nfl.jobs[0].usage.used<=220);
  assert.equal(nfl.jobs[0].usage.maxActive,4);assert.ok(nfl.jobs[0].usage.maxReserved<=12);
  const savedFirst=histories;assert.ok(savedFirst>100&&savedFirst<125);
  assert.equal((await call('inspect',null,'capture:nfl')).cache.length,savedFirst);
  await call('step');let s=await call('step');assert.equal(s.jobs[0].lastError,'Cloudflare pregame storage HTTP 503');const original=[...tables.worker_pregame_originals.values()][0];assert.equal(original.market,'shots_on_goal');await call('step',null,'capture:nba');
  const retry=s.jobs[0].retryAt;await mf.dispose();runtime=await setup(dir,answer);({mf,call}=runtime);await call('clock',retry+1);for(let i=0;i<7;i++){await call('clock',retry+1001+i*1001);s=await call('step');}
  assert.equal(s.jobs[0].state,'done');assert.ok((await call('inspect')).events.some(e=>e.outcome==='deferred'));assert.equal(tables.worker_pregame_originals.size,1);assert.equal(tables.worker_pregame_picks.size,1);assert.equal([...tables.worker_pregame_originals.values()][0].checksum,original.checksum);
  let n=await call('inspect',null,'capture:nfl');await call('clock',n.status.jobs[0].retryAt+1,'capture:nfl');n=await call('step',null,'capture:nfl');assert.equal(n.jobs[0].phase,'originals');assert.equal(n.jobs[0].usage.cacheHits,savedFirst);assert.equal(histories,125);
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
 try{runtime=await setup(dir,()=>{hits++;return Response.json({});});const worker=await runtime.mf.getWorker(),time=Date.parse('2026-11-27T23:10:00Z');
  await runtime.call('clock',time,'control:nba-acceptance');
  await worker.scheduled({cron:'*/2 * * * *',scheduledTime:time});await worker.scheduled({cron:'*/2 * * * *',scheduledTime:time});assert.equal(hits,0);
  const {marketsForCaptureTick}=await import('../scripts/worker-pregame-capture.mjs');const markets=marketsForCaptureTick(time).filter(m=>m.sport!=='nba');assert.ok(markets.length>0);
  for(const {sport,market} of markets){const s=await runtime.call('inspect',null,'capture:'+sport);assert.equal(s.status.jobs.filter(j=>j.market===market).length,1);}
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('protected NBA Points acceptance drains all queues and excludes scheduler and operator races',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-acceptance-runtime-'));
 const clock=Date.parse('2026-11-27T23:15:00Z'),day='2026-11-27';
 const lockAt='2026-11-28T00:00:00.000Z',expiresAt='2026-11-27T23:55:00.000Z';
 const fixtures={'1234':lockAt,'5678':'2026-11-28T01:00:00.000Z'};
 const grant={day,holdStartsAt:new Date(clock-60000).toISOString(),lockAt,expiresAt,scheduleSha256:checksum(fixtures)};
 const token='fixture-operator-credential-only-12345',lane='control:nba-acceptance';
 const scope={sport:'nba',market:'points',day,token};
 const otherLanes=['capture:nfl','capture:nhl','replay:nba','replay:nfl','replay:nhl'];
 let runtime,reply=fixtures,hold,entered,reads=0,rankingCalls=0;
 const outbound=async req=>{
  const url=new URL(req.url);
  if(url.hostname==='fixture.test'){
   assert.equal(url.searchParams.get('sport'),'nba');
   assert.equal(url.searchParams.get('market'),'points');
   rankingCalls++;
   return Response.json({rows:[]});
  }
  assert.equal(req.method,'GET');
  assert.equal(url.href,'https://db.supabase.co/rest/v1/rpc/verified_nba_board_schedule?p_day='+day);
  reads++;
  if(hold){entered();await hold;}
  return reply===null?new Response('{}',{status:503}):Response.json(reply);
 };
 try{
  runtime=await setup(dir,outbound,{SACH_NBA_ACCEPTANCE_OPERATOR_TOKEN:token,SACH_NBA_ACCEPTANCE_GRANT:JSON.stringify(grant)});
  const {mf,call}=runtime,operator=await mf.getWorker('operator-fixture'),worker=await mf.getWorker('dashboard-test');
  const invoke=async request=>(await operator.fetch('https://fixture.local/',{method:'POST',body:JSON.stringify(request)})).json();
  const expect=async(request,error)=>assert.deepEqual(await invoke(request),{error});
  await call('clock',clock,lane);await call('clock',clock,'capture:nba');
  await expect({...scope,token:'unauthorized'},'acceptance_unauthorized');
  await expect({...scope,market:'rebounds'},'acceptance_invalid_scope');
  await expect({...scope,sport:'nfl'},'acceptance_invalid_scope');
  await expect({...scope,day:'2026-11-28'},'acceptance_invalid_scope');
  await call('clock',Date.parse(expiresAt),lane);
  await expect(scope,'acceptance_closed');
  await call('clock',clock,lane);
  await call('in-flight-tick',1,lane);
  await expect(scope,'acceptance_concurrent_work');
  await call('in-flight-tick',0,lane);

  const hiddenLane='replay:nhl',older={id:'older-active',kind:'replay',sport:'nhl',state:'active',touched:clock};
  const done=Array.from({length:100},(_,i)=>({...older,id:'done-'+i,state:'done',touched:clock+i+1}));
  const visible=await call('seed',[older,...done],hiddenLane);
  assert.equal(visible.jobs.length,100);assert.ok(visible.jobs.every(j=>j.state==='done'));
  assert.equal((await call('readiness',null,hiddenLane)).active,1);
  await expect(scope,'acceptance_queue_busy');
  await call('clear-fixture-jobs',null,hiddenLane);
  await call('clock',clock,'capture:nfl');
  await call('lease',{token:'busy',until:clock+1000},'capture:nfl');
  await expect(scope,'acceptance_queue_busy');
  await call('clock',clock+1001,'capture:nfl');
  assert.equal(reads,0);

  reply=null;await expect(scope,'acceptance_schedule_unverified');
  reply={...fixtures,'5678':'2026-11-28T02:00:00.000Z'};
  await expect(scope,'acceptance_schedule_unverified');
  reply=fixtures;
  const checking=new Promise(resolve=>{entered=resolve;});
  let release;
  hold=new Promise(resolve=>{release=resolve;});
  const accepted=invoke(scope);
  try{
   await checking;
   await expect(scope,'acceptance_concurrent_work');
   await worker.scheduled({cron:'*/2 * * * *',scheduledTime:clock});
   await worker.scheduled({cron:'*/5 * * * *',scheduledTime:clock});
   for(const other of otherLanes)assert.equal((await call('readiness',null,other)).active,0);
  }finally{hold=null;release();}
  const id='acceptance:nba:points:'+day;
  assert.deepEqual(await accepted,{id,queued:true});
  await expect(scope,'acceptance_queue_busy');
  for(let i=0;i<4;i++)await call('step',null,'capture:nba');
  assert.deepEqual(await invoke(scope),{id,queued:false});
  assert.equal(rankingCalls,1);
  assert.equal((await call('inspect',null,'capture:nba')).status.jobs.length,1);
  assert.equal((await call('readiness',null,'capture:nba')).busy,false);
  await worker.scheduled({cron:'0,30 * * * *',scheduledTime:Date.UTC(2026,10,27,23,30)});
  const gradeLanes=await Promise.all(['nba','nfl','nhl'].map(sport=>call('inspect',null,'grade:'+sport)));
  assert.equal(gradeLanes.flatMap(result=>result.status.jobs).filter(j=>j.kind==='grade').length,1);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

const unavailableBoard = JSON.parse(await readFile(
 new URL('./fixtures/nba-points-unavailable-2026-11-24.json', import.meta.url),
 'utf8',
));

test('capture blocks the retained unavailable board in an eligible routine lane and preserves healthy empty and populated outcomes', async () => {
 const dir = await mkdtemp(join(tmpdir(), 'dashboard-board-state-'));
 const tables = {worker_pregame_originals:new Map(), worker_pregame_picks:new Map()};
 const capturedAt = new Date(now).toISOString();
 let runtime;
 let board = unavailableBoard;
 let reads = 0;
 let writes = 0;
 const lane = 'capture:nhl';
 const cacheKey = 'board:nhl:points';
 const answer = async request => {
  const url = new URL(request.url);
  if (url.hostname === 'fixture.test') return Response.json({board});
  assert.equal(url.hostname, 'db.supabase.co');
  const table = tables[url.pathname.split('/').at(-1)];
  assert.ok(table);
  if (request.method === 'GET') {
   reads++;
   return Response.json([...table.values()]);
  }
  assert.equal(request.method, 'POST');
  writes++;
  assert.equal(request.headers.get('Prefer'), 'resolution=ignore-duplicates,return=minimal');
  for (const record of await request.json()) {
   if (!table.has(key(record))) table.set(key(record), {...record, captured_at:capturedAt});
  }
  return new Response(null, {status:201});
 };
 try {
  runtime = await setup(dir, answer);
  const {call, mf} = runtime;
  const kv = await mf.getKVNamespace('VINEXT_KV_CACHE');
  const step = () => call('step', null, lane);
  const enqueue = id => call('enqueue', {id, sport:'nhl', market:'points', kind:'capture', created:now}, lane);
  const job = (status, id) => status.jobs.find(entry => entry.id === id);
  await kv.put(cacheKey, 'previous-board');
  await call('clock', now + 300000, lane);

  await enqueue('unavailable');
  const blocked = job(await step(), 'unavailable');
  assert.equal(blocked.state, 'blocked');
  assert.equal(blocked.lastError, 'rankings_board_unavailable');
  assert.equal(blocked.retryAt, null);
  await enqueue('unavailable');
  assert.equal(job(await step(), 'unavailable').state, 'blocked');
  const inspected = await call('inspect', null, lane);
  assert.deepEqual(inspected.docs, []);
  assert.deepEqual(inspected.events.map(entry => entry.outcome), ['blocked']);
  assert.equal(await kv.get(cacheKey), 'previous-board');
  assert.deepEqual([reads, writes], [0, 0]);

  board = {success:true, market:'points', rows:[]};
  await enqueue('healthy-empty');
  for (let phase = 0; phase < 3; phase++) await step();
  const empty = job(await step(), 'healthy-empty');
  assert.equal(empty.state, 'done');
  assert.equal(empty.eligible, 0);
  assert.equal(empty.lastError, null);
  assert.equal(await kv.get(cacheKey), 'previous-board');
  assert.deepEqual([reads, writes], [0, 0]);

  board = {success:true, market:'points', rows:[row()]};
  await enqueue('populated');
  for (let phase = 0; phase < 3; phase++) await step();
  const populated = job(await step(), 'populated');
  assert.equal(populated.state, 'done');
  assert.equal(populated.eligible, 1);
  assert.equal(writes, 2);
  const firstReceipts = Object.values(tables).map(table => [...table.values()]);
  assert.ok(firstReceipts.every(records => records.length === 1));
  assert.ok(firstReceipts.flat().every(record =>
   record.player_id === '123' && record.game_id === row().gameId &&
   record.captured_at === capturedAt && record.payload.quote.quoteId === row().quoteId
  ));
  assert.deepEqual(JSON.parse(await kv.get(cacheKey)), board);

  const refreshed = row();
  refreshed.quoteId = 'later-quote';
  refreshed.researchForecast.modelSelection.quoteId = 'later-quote';
  board = {success:true, market:'points', rows:[refreshed]};
  await enqueue('populated-retry');
  for (let phase = 0; phase < 3; phase++) await step();
  assert.equal(job(await step(), 'populated-retry').state, 'done');
  assert.equal(writes, 2);
  assert.deepEqual(Object.values(tables).map(table => [...table.values()]), firstReceipts);
 } finally {
  await runtime?.mf.dispose();
  await rm(dir, {recursive:true, force:true});
 }
});

test('a checkpointed unavailable board cannot write or publish when resumed', async () => {
 for (const phase of ['originals', 'picks', 'publish']) {
  const unexpected = () => assert.fail('An unavailable checkpoint must stop before making any calls');
  await assert.rejects(
   capturePhase({phase, board:unavailableBoard}, {publish:unexpected, now:unexpected}),
   {message:'rankings_board_unavailable', blocked:true},
  );
 }
});

test('grant expiry during an admitted body prevents its SQLite checkpoint and blocks the one-shot',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-acceptance-drain-'));
 const day='2026-11-27',clock=Date.parse(day+'T23:15:00Z');
 const lockAt='2026-11-28T00:00:00.000Z',expiresAt=day+'T23:55:00.000Z';
 const fixtures={'1234':lockAt},token='fixture-expiry-operator-only-12345';
 const grant={day,holdStartsAt:new Date(clock-60000).toISOString(),lockAt,expiresAt,scheduleSha256:checksum(fixtures)};
 const lane='capture:nba',control='control:nba-acceptance';
 let runtime,entered,finishBody,outboundWrites=0;
 const headersSent=new Promise(resolve=>{entered=resolve;});
 try{
  runtime=await setup(dir,req=>{
   const url=new URL(req.url);
   if(req.method!=='GET')outboundWrites++;
   if(url.hostname==='db.supabase.co')return Response.json(fixtures);
   if(url.hostname==='fixture.test')return Response.json({histories:1});
   assert.equal(url.hostname,'api-web.nhle.com');
   return new Response(new ReadableStream({start(s){
    finishBody=()=>{try{s.enqueue(new TextEncoder().encode('{"gameLog":[]}'));s.close();}catch{}};
    entered();
   }}));
  },{SACH_NBA_ACCEPTANCE_OPERATOR_TOKEN:token,SACH_NBA_ACCEPTANCE_GRANT:JSON.stringify(grant)});
  const {call,mf}=runtime;
  await call('clock',clock,control);
  await call('clock',clock,lane);
  const operator=await mf.getWorker('operator-fixture');
  const accepted=await operator.fetch('https://fixture.local/',{method:'POST',body:JSON.stringify({sport:'nba',market:'points',day,token})});
  assert.deepEqual(await accepted.json(),{id:'acceptance:nba:points:'+day,queued:true});
  const step=call('step',null,lane);
  try{
   await headersSent;
   await call('clock',Date.parse(expiresAt),lane);
  }finally{finishBody?.();}
  const outcome=(await step).jobs[0];
  assert.equal(outcome.state,'blocked');
  assert.equal(outcome.lastError,'acceptance_closed');
  assert.equal(outcome.usage.cacheWrites,0);
  const after=await call('inspect',null,lane);
  assert.deepEqual(after.cache,[]);
  assert.deepEqual(after.docs,[]);
  assert.equal(after.status.lease,null);
  assert.equal(outboundWrites,0);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('completed window resumes fresh NFL/NHL schedules after restart, holds NBA and preserves interrupted fan-out',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-restoration-'));
 const control='control:nba-acceptance',day='2026-11-27';
 const from=Date.parse(day+'T22:30:00Z'),expires=Date.parse(day+'T23:50:00Z');
 const grant=JSON.stringify({day,holdStartsAt:new Date(from).toISOString(),expiresAt:new Date(expires).toISOString(),
  lockAt:'2026-11-28T00:00:00.000Z',scheduleSha256:'a'.repeat(64)});
 const {marketsForCaptureTick}=await import('../scripts/worker-pregame-capture.mjs');
 const {workerHistoryBackupScope}=await import('../scripts/worker-history-backup.mjs');
 const cron='*/2 * * * *';
 let runtime,calls=0;
 const outbound=()=>{calls++;throw Error('scheduled dispatch must only enqueue');};
 try{
  runtime=await setup(dir,outbound,{SACH_NBA_ACCEPTANCE_GRANT:grant});
  let {call}=runtime;
  await call('clock',expires-60000,control);
  const held=await call('capture-tick',{cron,time:expires-120000},control);
  assert.deepEqual(held,{queued:[],held:true,heldSports:['nba','nfl','nhl'],until:expires});
  const marker={quoteId:'original',grade:'first',capturedAt:from};
  await call('receipt',marker,'capture:nba');
  await call('in-flight-tick',1,control);
  await runtime.mf.dispose();
  runtime=await setup(dir,outbound,{SACH_NBA_ACCEPTANCE_GRANT:grant});
  ({call}=runtime);
  await call('clock',expires,control);
  assert.equal((await call('capture-tick',{cron,time:expires-120000},control)).reason,'capture_tick_elapsed');
  const scheduledSports=new Set(),replaySports=new Set();
  for(let time=expires;time<expires+38*60000;time+=120000){
   await call('clock',time,control);
   const tick=await call('capture-tick',{cron,time},control);
   const expectedMarkets=marketsForCaptureTick(time).filter(job=>job.sport!=='nba');
   assert.deepEqual(tick.heldSports,['nba']);
   for(const {sport,market} of expectedMarkets){
    assert.ok(tick.queued.some(id=>id.startsWith(`capture:${sport}:${market}:`)));
    scheduledSports.add(sport);
   }
   const replay=workerHistoryBackupScope(time,true).sport;
   if(replay!=='nba'){assert.ok(tick.queued.some(id=>id.startsWith('replay:'+replay+':')));replaySports.add(replay);}
   assert.ok(tick.queued.every(id=>!id.includes(':nba:')));
  }
  assert.deepEqual([...scheduledSports].sort(),['nfl','nhl']);
  assert.deepEqual([...replaySports].sort(),['nfl','nhl']);
  assert.equal((await call('hold',null,control)).interrupted,1);
  assert.equal((await call('inspect',null,'replay:nba')).status.jobs.length,0);
  assert.equal((await call('receipt',{...marker,grade:'changed'},'capture:nba'))[0].grade,'first');
  assert.equal(calls,0);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('revocation and invalid or excessive grants release other sports and fence old NBA work',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'dashboard-restoration-revoked-'));
 const control='control:nba-acceptance',day='2026-11-27',lane='capture:nba';
 const starts=Date.parse(day+'T22:45:00Z'),expires=Date.parse(day+'T23:50:00Z');
 const clock=Date.parse(day+'T23:00:00Z'),lock=Date.parse('2026-11-28T00:00:00Z');
 const hash='b'.repeat(64);
 const grant={day,holdStartsAt:new Date(starts).toISOString(),expiresAt:new Date(expires).toISOString(),
  lockAt:new Date(lock).toISOString(),scheduleSha256:hash};
 const acceptance={day,starts,lock,expires,scheduleSha256:hash};
 const cron='*/2 * * * *';
 let runtime,nbaCalls=0;
 const outbound=request=>{
  const url=new URL(request.url);
  if(url.searchParams.get('sport')==='nba'||url.searchParams.get('sport')==='eq.nba')nbaCalls++;
  assert.equal(request.method,'GET');
  return Response.json(url.hostname==='fixture.test'?{rows:[]}:[]);
 };
 try{
  runtime=await setup(dir,outbound,{SACH_NBA_ACCEPTANCE_GRANT:JSON.stringify(grant)});
  let {call}=runtime;
  await call('clock',clock,control);
  assert.equal((await call('capture-tick',{cron,time:clock},control)).held,true);
  const common={sport:'nba',market:'points',kind:'capture',created:clock,touched:clock,state:'active',phase:'rank'};
  await call('seed',[{...common,id:'acceptance:nba:points:'+day,acceptance}],lane);
  await call('seed',[{...common,kind:'replay',id:'old-replay'}],'replay:nba');
  await runtime.mf.dispose();
  runtime=await setup(dir,outbound);
  ({call}=runtime);
  await call('clock',clock+120000,control);
  assert.equal((await call('capture-tick',{cron,time:clock},control)).reason,'capture_tick_elapsed');
  assert.equal((await call('hold',null,control)).hold.expires,clock+120000);
  assert.equal((await call('capture-tick',{cron,time:clock+120000},control)).held,undefined);
  await call('clock',clock+120000,lane);
  await call('clock',clock+120000,'replay:nba');
  const revoked=(await call('step',null,lane)).jobs[0];
  assert.deepEqual([revoked.state,revoked.lastError,revoked.retryAt],['blocked','acceptance_revoked',null]);
  const old=(await call('step',null,'replay:nba')).jobs[0];
  assert.deepEqual([old.state,old.lastError,old.retryAt],['blocked','nba_routine_held',null]);
  for(const value of ['invalid',JSON.stringify({...grant,holdStartsAt:day+'T20:00:00Z'})]){
   await runtime.mf.dispose();runtime=await setup(dir,outbound,{SACH_NBA_ACCEPTANCE_GRANT:value});
   ({call}=runtime);
   await call('clock',clock+240000,control);
   const tick=await call('capture-tick',{cron,time:clock+240000},control);
   assert.equal(tick.held,undefined);
   assert.deepEqual(tick.heldSports,['nba']);
   assert.ok(tick.queued.every(id=>!id.includes(':nba:')));
  }
  assert.equal(nbaCalls,0);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
