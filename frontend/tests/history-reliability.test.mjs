import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {loadTs} from './load-ts.mjs';import {checksum,cloudRequest} from '../scripts/history-cloud.mjs';
const {performanceView}=await loadTs(new URL('../lib/performance-view.ts',import.meta.url));
const {readSavedPerformance}=await loadTs(new URL('../lib/saved-performance.ts',import.meta.url));
const {reconcilePerformanceRecords}=await loadTs(new URL('../lib/performance-reconciliation.ts',import.meta.url));
const {cachedOfficialResult,saveOfficialResult}=await loadTs(new URL('../lib/official-result-cache.ts',import.meta.url));
test('cold saved records arrive before provider reconciliation and complete in the deferred job',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-cold-history-')),jobs=[];let providerCalls=0,release;const gate=new Promise(resolve=>release=resolve),now=Date.now();
 const reader=async(_sport,_period,_now,_root,options)=>{if(options?.observe!==false){providerCalls++;await gate;return {records:[{status:'hit',actual:0}],coverage:{complete:true},summary:{hits:1}};}return {records:[{status:'pending',actual:null}],coverage:{complete:true},summary:{hits:0}};};const timeout=setTimeout(()=>release(),1000);
 try{const initial=await performanceView('nba','Today',work=>jobs.push(work),now,root,reader);assert.equal(providerCalls,0);assert.equal(initial.records[0].actual,null);assert.equal(initial.refreshing,true);const finish=jobs[0]();release();await finish;assert.equal(providerCalls,1);const done=await performanceView('nba','Today',()=>{},now+2000,root,reader);assert.equal(done.records[0].actual,0);assert.equal(done.records[0].status,'hit');assert.equal(done.refreshing,false);}finally{clearTimeout(timeout);release();await rm(root,{recursive:true,force:true});}
});
test('fixture identity reconciles early captures and grades the locked original line rather than a replacement',()=>{
 const original={gameDate:'2026-10-24',gameTime:'2026-10-25T20:00Z',gameId:'1',playerId:'2',market:'points',pickSide:'OVER',sportsbookLine:20,modelProjection:25,performanceSource:'locked',savedAt:'2026-10-24T10:00Z',status:'pending'};
 const later={...original,gameDate:'2026-10-25',performanceSource:'board',savedAt:'2026-10-25T10:00Z',sportsbookLine:10,modelProjection:12,status:'hit',actual:15,verifiedResult:true,resultSource:'official_final_boxscore',gradedAt:'2026-10-26T01:00Z'};
 const result=reconcilePerformanceRecords([later,original]);assert.equal(result.records.length,1);assert.equal(result.records[0].key,'2026-10-25||points|1|2');assert.equal(result.duplicates,1);assert.equal(result.conflicts,1);assert.equal(result.records[0].sportsbookLine,20);assert.equal(result.records[0].modelProjection,25);assert.equal(result.records[0].actual,15);assert.equal(result.records[0].status,'miss');assert.equal(original.status,'pending');
 assert.equal(reconcilePerformanceRecords([original,{...later,verifiedResult:false}]).records[0].status,'pending');
});
test('archived-only locked forecasts and checksum-verified final observations recover without a live provider request',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-cloud-recovery-')),oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 const now=new Date(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now),gameTime=new Date(+now-4*3600000).toISOString(),capture=new Date(+now-6*3600000).toISOString();
 const row={playerId:'p',gameId:'g',market:'shots_on_goal',gameTime,quoteVerified:true,sportsbookLine:2.5,researchForecast:{status:'available',projection:1.5}},payload=[{capturedAt:capture,rows:[row]}];
 const final={success:true,gameId:'g',state:'post',updatedAt:now.toISOString(),rows:[{playerId:'p',stats:{shots_on_goal:0}}]},envelope={version:1,payload:final,sha256:createHash('sha256').update(JSON.stringify(final)).digest('hex')};let calls=0;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
 globalThis.fetch=async url=>{calls++;const u=String(url);assert.ok(u.startsWith('https://test.invalid/rest/v1/history_documents?'));const docs=[{stream:'slate_locked_shots_on_goal',game_date:day,payload,checksum:checksum(payload)},{stream:'official_final_g',game_date:day,payload:envelope,checksum:checksum(envelope)}];return Response.json(u.includes('select=stream,game_date,checksum,source_bytes')?docs.map(({payload,...meta})=>meta):docs.filter(r=>u.includes('stream=eq.'+r.stream)));};
 try{const result=await readSavedPerformance('nhl','Week',now,root,{observe:false});assert.equal(result.records.length,1);assert.equal(result.records[0].status,'hit');assert.equal(result.records[0].actual,0);assert.equal(result.records[0].modelProjection,1.5);assert.equal(result.coverage.complete,true);assert.equal(calls,3);}finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;await rm(root,{recursive:true,force:true});}
});
test('official result cache rejects tampering and cannot retain old full records beyond seven Toronto days',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-finals-')),payload={success:true,gameId:'123',state:'post',rows:[{playerId:'p',stats:{points:0}}]},day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 try{await saveOfficialResult(root,'nba','123',new Date().toISOString(),payload);const e=JSON.parse(await readFile(path.join(root,'nba',`official_final_123_${day}.json`),'utf8'));assert.equal(cachedOfficialResult(e).rows[0].stats.points,0);assert.equal(cachedOfficialResult({...e,payload:{...payload,rows:[]}}),null);assert.equal(cachedOfficialResult({version:1}),null);await saveOfficialResult(root,'nba','124','2020-01-01T12:00Z',{...payload,gameId:'124'});await assert.rejects(readFile(path.join(root,'nba','official_final_124_2020-01-01.json')));}finally{await rm(root,{recursive:true,force:true});}
});
test('cloud errors retain the actionable provider code without printing body details or secrets',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';globalThis.fetch=async()=>Response.json({code:'PGRST002',details:'private connection details'},{status:503});
 try{await assert.rejects(cloudRequest('history_documents'),error=>error.code==='PGRST002'&&error.status===503&&!error.message.includes('private'));}finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});

test('all sports read their existing immutable pregame/final receipts without calling external providers or changing originals',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-receipt-results-')),originalFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldPublic=process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_URL;
 const gameTime=new Date(Date.now()-2*3600000).toISOString(),at=new Date(Date.now()-3*3600000).toISOString(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());let calls=0;globalThis.fetch=async()=>{calls++;throw Error('provider must not be called');};
 try{for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
  const market='points',dir=path.join(root,sport);await mkdir(dir,{recursive:true});if(sport==='mlb')await mkdir(path.join(dir,'performance'));
  const row={playerId:'p',gameId:'g',market,gameTime,quoteVerified:true,sportsbookLine:2.5,researchForecast:{status:'available',projection:1.5}};
  const pre=JSON.stringify([{savedAt:at,payload:{kind:'pregame_checkpoint',gameId:'g',market,checkpointAt:at,rows:[row]}}]),fin=JSON.stringify([{savedAt:new Date().toISOString(),payload:{kind:'official_final_checkpoint',gameId:'g',gameTime,source:'official_final_boxscore',boxscore:{success:true,gameId:'g',state:'post',rows:[{playerId:'p',stats:{points:0}}]}}}]);
  const target=sport==='mlb'?path.join(dir,'performance'):dir;
  const file=path.join(target,`protected_pregame_g_points_${day}.json`),finalFile=path.join(target,`protected_final_g_${day}.json`);await writeFile(file,pre);await writeFile(finalFile,fin);
  const result=await readSavedPerformance(sport,'Week',new Date(),root,{observe:false});assert.equal(result.records.length,1);
  // Soccer/MLB have raw final adapters, so generic research settlement remains unsupported.
  if(!['soccer','mlb'].includes(sport)){assert.equal(result.records[0].status,'hit');assert.equal(result.records[0].actual,0);}else assert.equal(result.records[0].status,'pending');
  assert.equal(await readFile(file,'utf8'),pre);assert.equal(await readFile(finalFile,'utf8'),fin);
 }assert.equal(calls,0);}finally{globalThis.fetch=originalFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldPublic===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldPublic;await rm(root,{recursive:true,force:true});}
});

test('an older duplicated final cannot reverse a more recent official correction',()=>{
 const r={gameDate:'2026-10-25',gameId:'g',playerId:'p',market:'points',sportsbookLine:10.5,pickSide:'OVER',status:'hit',actual:12,verifiedResult:true,resultSource:'official_final_boxscore',gradedAt:'2026-10-26T12:00Z'};
 const older={...r,status:'miss',actual:9,gradedAt:'2026-10-26T11:00Z'};assert.equal(reconcilePerformanceRecords([r,older]).records[0].actual,12);
});

test('first history response remains local when cloud is configured but unresponsive',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-cloud-first-')),oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;let calls=0;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';globalThis.fetch=async()=>{calls++;throw Error('cloud should run after the response');};
 const now=new Date(),day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 try{await mkdir(path.join(root,'nfl'));await writeFile(path.join(root,'nfl',`passing_yards_${day}.json`),JSON.stringify([{key:'saved',gameDate:day,market:'passing_yards',status:'hit',actual:0}]));const data=await readSavedPerformance('nfl','Today',now,root,{observe:false,cloud:false});assert.equal(calls,0);assert.equal(data.records[0].actual,0);assert.equal(data.summary.hits,1);assert.equal(data.coverage.complete,false);assert.deepEqual(data.coverage.errors,['cloud:checking']);}
 finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;await rm(root,{recursive:true,force:true});}
});

test('failed cloud coverage backs off while preserving saved records and retries after a minute',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-backoff-')),jobs=[],now=Date.now();let reads=0;
 const reader=async()=>{reads++;return {records:[{key:'original',status:'hit',actual:0}],coverage:{complete:false,errors:['cloud:unavailable']},summary:{hits:1}}};
 try{
  await performanceView('nba','Season',work=>jobs.push(work),now,root,reader);await jobs.shift()();assert.equal(reads,2);
  const cached=await performanceView('nba','Season',work=>jobs.push(work),now+6000,root,reader);assert.equal(cached.records[0].key,'original');assert.equal(cached.refreshing,false);assert.equal(jobs.length,0);
  await performanceView('nba','Season',work=>jobs.push(work),now+61000,root,reader);assert.equal(jobs.length,1);await jobs.shift()();
 }finally{await rm(root,{recursive:true,force:true});}
});

test('reconciliation preserves scorer occurrence semantics on the original legacy line',()=>{
 for(const market of ['anytime_td','first_td','first_basket']){
 const original={gameDate:'2026-10-25',gameId:'g',playerId:'p',market,sportsbookLine:1,pickSide:'OVER',status:'pending'};
 const official={...original,actual:1,status:'hit',verifiedResult:true,resultSource:'official_final_boxscore',gradedAt:'2026-10-26T12:00Z'};
 const result=reconcilePerformanceRecords([original,official]).records[0];assert.equal(result.status,'hit');assert.equal(result.sportsbookLine,1);
 }
});
