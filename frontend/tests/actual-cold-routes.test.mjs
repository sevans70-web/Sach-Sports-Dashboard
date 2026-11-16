import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile,cp,readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {gunzipSync} from 'node:zlib';import {rolldown} from 'rolldown';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {workerModelRuntimePlugin} from '../build/worker-model-runtime.mjs';
const read=async path=>JSON.parse(gunzipSync(await readFile(new URL(path,import.meta.url))));
const actual=(await read('./fixtures/official-cold-route-2026-11-15.json.gz')).data,recorded=await read('./fixtures/nfl-live-2026-11-15.json.gz'),boards=(await read('../../docs/audits/2026-11-15-release-blockers/recorded-browser-inputs.json.gz')).files;
const now=Date.parse('2026-11-15T11:02:00Z'),quote=recorded.passing_yards.rows[0];
// Provider contract reconstructed from authentic recorded receipts, without changing prices or identity.
function providerRows(rows){const games=new Map();for(const r of rows){const [awayTeam,homeTeam]=r.matchup.split(' @ ');let game=games.get(r.gameId);if(!game){game={gameId:r.gameId,awayTeam,homeTeam,commenceTime:r.gameTime,books:[]};games.set(r.gameId,game);}let book=game.books.find(b=>b.key===r.sportsbookKey);if(!book){book={key:r.sportsbookKey,title:r.sportsbook,props:[]};game.books.push(book);}book.props.push({playerName:r.playerName,team:r.teamName,category:r.market,periodID:'game',line:r.sportsbookLine,overPrice:r.overPrice,underPrice:r.underPrice,lastUpdate:r.quoteUpdatedAt,propId:r.quoteId,isMainLine:true});}return {data:[...games.values()]};}
const nhlRows=[boards['nhl-shots_on_goal.json'].rows.find(r=>String(r.playerId)==='8478403'),boards['nhl-points.json'].rows.find(r=>String(r.playerId)==='8478403'),...boards['nhl-goalie_saves.json'].rows.filter(r=>['8482445','8478024'].includes(String(r.playerId)))];
async function bundle(dir,source){
 if(process.env.SACH_COMPILED_RUNTIME==='1'||source){
  const shipping=resolve(source||process.env.SACH_REPLAY_BUNDLE||'.cloudflare/output/v0/workers/default/bundle');
  const config=JSON.parse(await readFile(resolve(shipping,'../worker.config.json'),'utf8'));
  const entry=config.manifest.mainModule;
  assert.ok(!entry.includes('..')&&!entry.startsWith('/'),'only the verified shipping entry may be imported');
  await cp(shipping,dir,{recursive:true});
  const fixture=await readFile(resolve('tests/fixtures/actual-rankings-runtime.mjs'),'utf8');
  const clock=fixture.slice(fixture.indexOf('let now='),fixture.indexOf('const dashboard='));
  const queue=fixture.slice(fixture.indexOf('export class ActualRankingQueue'));
  await writeFile(join(dir,'worker.mjs'),`import dashboard,{DashboardJobQueue as Base} from './${entry}';\n`+clock+queue);return;
 }
 const model=workerModelRuntimePlugin(),b=await rolldown({input:resolve('tests/fixtures/actual-rankings-runtime.mjs'),external:['cloudflare:workers',/^node:/],platform:'neutral',plugins:[{name:'real-source-aliases',resolveId(id){if(id==='next/server')return resolve('tests/fixtures/ranking-framework.mjs');if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts');}},{name:model.name,transform:model.transform}]});await b.write({file:join(dir,'worker.mjs'),format:'esm'});await b.close();}
async function runtime(dir,state){const calls=[];const tables=state.tables??={worker_pregame_originals:new Map(),worker_pregame_picks:new Map()};const key=r=>[r.sport,r.market,r.game_id,r.player_id].join('|');
 const answer=async req=>{const u=new URL(req.url);calls.push({url:u.origin+u.pathname,method:req.method});
  if(state.finalResponses?.[req.url])return Response.json(state.finalResponses[req.url]);
  if(u.hostname==='api.owlsinsight.com'){assert.equal(req.headers.get('Authorization'),'Bearer synthetic-fixture-only');assert.equal(req.headers.get('x-api-key'),'synthetic-fixture-only');state.books=(state.books||0)+1;const denied=state.denied||state.denyLater&&state.books>1;if(state.blockFirst&&state.books===1){state.entered();await state.release;}return denied?new Response('{}',{status:403,headers:{'Retry-After':'1800'}}):Response.json(u.pathname.includes('/nfl/')?providerRows([quote]):providerRows(nhlRows));}
  if(u.hostname==='api.sportsgameodds.com'){assert.equal(req.headers.get('x-api-key'),'synthetic-supplement-only');
   if(!state.supplement)return new Response('{}',{status:401});
   const [awayTeam,homeTeam]=quote.matchup.split(' @ '),price=side=>({[quote.sportsbookKey]:{available:true,odds:side==='over'?quote.overPrice:quote.underPrice,overUnder:quote.sportsbookLine,lastUpdatedAt:quote.quoteUpdatedAt}});
   return Response.json({data:[{eventID:quote.gameId,status:{startsAt:quote.gameTime},teams:{away:{names:{long:awayTeam}},home:{names:{long:homeTeam}}},players:{[quote.playerId]:{name:quote.playerName}},odds:{o:{playerID:quote.playerId,statID:'passing_yards',periodID:'game',sideID:'over',betTypeID:'ou',opposingOddID:'u',byBookmaker:price('over')},u:{playerID:quote.playerId,statID:'passing_yards',periodID:'game',sideID:'under',betTypeID:'ou',opposingOddID:'o',byBookmaker:price('under')}}}]});
  }
  if(u.hostname.endsWith('.espn.com')){
   if(u.pathname.endsWith('/scoreboard'))return Response.json(actual['nfl-score']);
   if(u.pathname.endsWith('/roster'))return Response.json(actual['nfl-roster-'+u.pathname.split('/').at(-2)]||{athletes:[]});
   if(u.pathname.endsWith('/gamelog')||u.pathname.includes('/apis/search/')){state.espnDenied=(state.espnDenied||0)+1;return new Response('{}',{status:403});}
   if(u.pathname.endsWith('/summary'))return new Response('{}',{status:404});
  }
  if(u.hostname==='api-web.nhle.com'){
   if(u.pathname.includes('/score/'))return Response.json(actual['nhl-score']);
   if(u.pathname.includes('/standings/'))return Response.json(actual['nhl-standings']);
   if(u.pathname.includes('/roster/'))return Response.json(actual['nhl-roster-'+u.pathname.split('/')[3]]);
   if(u.pathname.includes('/game-log/'))return Response.json(actual['nhl-log-'+u.pathname.split('/')[3]]||{gameLog:[]});
  }
  if(u.hostname==='api.nhle.com'){assert.equal(u.searchParams.get('cayenneExp'),'seasonId=20262027 and gameTypeId=2','old hardcoded statistics season must not recur');return Response.json(actual['nhl-'+u.pathname.split('/').slice(-2).join('-')]);}
  if(u.hostname==='db.supabase.co'){
   const table=tables[u.pathname.split('/').at(-1)];if(!table){assert.equal(req.method,'GET','historical documents must not be rewritten');return Response.json([]);}
   if(req.method==='POST'){for(const r of await req.json())if(!table.has(key(r)))table.set(key(r),r);if(state.loseAck||state.loseGradeAck&&u.pathname.endsWith('/worker_pregame_grades')){state.loseAck=false;state.loseGradeAck=false;return new Response('{}',{status:503});}return new Response(null,{status:201});}
   const rows=[...table.values()].filter(r=>['sport','market','game_id','player_id'].every(field=>{
    const filter=u.searchParams.get(field);return !filter||(filter.startsWith('eq.')?String(r[field])===filter.slice(3):filter.startsWith('in.(')?filter.slice(4,-1).split(',').includes(String(r[field])):true);
   }));const offset=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||rows.length);
   return Response.json(rows.slice(offset,offset+limit));
  }throw Error('Unexpected outbound '+u.origin+u.pathname);
 };
 const options=convertV4MiniflareOptions({name:'actual-rankings',modules:process.env.SACH_COMPILED_RUNTIME==='1'?[{type:'ESModule',path:join(dir,'worker.mjs')},...(await readdir(dir,{recursive:true})).filter(p=>p.endsWith('.js')).map(p=>({type:'ESModule',path:join(dir,p)}))]:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],durableObjects:{DASHBOARD_JOBS:{className:'ActualRankingQueue',useSQLite:true}},kvNamespaces:['VINEXT_KV_CACHE'],serviceBindings:{ASSETS:()=>new Response(null,{status:404})},resourcePersistencePath:join(dir,'storage'),bindings:{OWLS_INSIGHT_API_KEY:'synthetic-fixture-only',SPORTSGAMEODDS_API_KEY:'synthetic-supplement-only',SUPABASE_URL:'https://db.supabase.co',SUPABASE_SECRET_KEY:'synthetic-fixture-only'},outboundService:answer});options.workers[0].config.limits={subrequests:350,cpuMs:30000};const mf=new Miniflare(options);
 const call=async(action,value,lane='capture:nfl')=>{const r=await mf.dispatchFetch('https://test/control',{method:'POST',body:JSON.stringify({action,value,lane})});assert.equal(r.status,200,await r.clone().text());return r.json();};return {mf,call,calls};}
test('actual NFL route captures authentic quotes with ESPN 403 and resumes after lost acknowledgement/restart',async()=>{const dir=await mkdtemp(join(tmpdir(),'actual-cold-nfl-'));let r;const state={loseAck:true};try{await bundle(dir);r=await runtime(dir,state);await r.call('enqueue',{id:'actual-nfl',kind:'capture',sport:'nfl',market:'passing_yards',created:now});let s=await r.call('step');assert.equal(s.jobs[0].phase,'originals',JSON.stringify(s));assert.equal(s.jobs[0].eligible,1);assert.ok(state.espnDenied>0);assert.ok(s.jobs[0].usage.used>0,'cold framework must not bypass job accounting');assert.ok(s.jobs[0].usage.maxActive<=4);assert.ok(s.jobs[0].usage.cacheWrites>0);s=await r.call('step');assert.match(s.jobs[0].lastError,/storage HTTP 503/);const first=[...state.tables.worker_pregame_originals.values()][0];assert.ok(first);await r.mf.dispose();r=await runtime(dir,state);for(let i=0;i<5;i++)s=await r.call('step');assert.equal(s.jobs[0].state,'done');assert.equal(state.tables.worker_pregame_originals.size,1);assert.deepEqual([...state.tables.worker_pregame_originals.values()][0],first);assert.equal(state.tables.worker_pregame_picks.size,0);assert.equal(first.payload.quote.line,quote.sportsbookLine);assert.equal(first.payload.quote.overPrice,quote.overPrice);}finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});
test('actual NFL denied-book route stops before ESPN and persists a bounded blocked state across restart',async()=>{const dir=await mkdtemp(join(tmpdir(),'actual-denied-nfl-'));let r;const state={denied:true};try{await bundle(dir);r=await runtime(dir,state);await r.call('enqueue',{id:'denied-nfl',kind:'capture',sport:'nfl',market:'passing_yards',created:now});let s;for(let i=0;i<3;i++)s=await r.call('step');assert.equal(s.jobs[0].state,'blocked',JSON.stringify(s));assert.equal(s.jobs[0].attempts,3);assert.equal(s.jobs[0].lastError,'rankings_provider_http_403');assert.equal(s.jobs[0].failureDetails.endpoint,'/api/v1/nfl/props');assert.equal(state.espnDenied||0,0);const books=state.books;await r.mf.dispose();r=await runtime(dir,state);await r.call('step');assert.equal(state.books,books);assert.equal(state.tables.worker_pregame_originals.size,0);assert.equal(state.tables.worker_pregame_picks.size,0);}finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});
test('actual NHL routes use current-season official sources and retain legitimately quoted candidates',async()=>{const dir=await mkdtemp(join(tmpdir(),'actual-nhl-'));let r;try{await bundle(dir);r=await runtime(dir,{});await r.call('clock',Date.parse('2026-11-15T15:53:00Z'));for(const market of ['shots_on_goal','points','goalie_saves']){const response=await r.mf.dispatchFetch('https://test/api/nhl/rankings?market='+market),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.ok(body.sourceCoverage.parsedMarketQuotes>0,JSON.stringify(body));assert.ok(body.officialHistoryCoverage.requested>0,JSON.stringify(body));assert.ok(body.rows.some(row=>row.quoteVerified),JSON.stringify(body));console.log('ACTUAL_NHL',market,JSON.stringify({displayable:body.displayableRows,quotes:body.verifiedQuoteCount,history:body.officialHistoryCoverage,blockers:body.forecastBlockers}));}const firstGoal=await (await r.mf.dispatchFetch('https://test/api/nhl/rankings?market=first_goal')).json();assert.equal(firstGoal.success,true);assert.equal(firstGoal.dataState,'fresh');assert.ok(r.calls.some(c=>c.url.includes('/skater/summary')));}finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});

test('actual NFL route uses the already configured authorized supplemental feed when primary and ESPN history are denied',async()=>{const dir=await mkdtemp(join(tmpdir(),'actual-alternate-nfl-'));let r;const state={denied:true,supplement:true};try{await bundle(dir);r=await runtime(dir,state);await r.call('enqueue',{id:'alternate-nfl',kind:'capture',sport:'nfl',market:'passing_yards',created:now});let s=await r.call('step');assert.equal(s.jobs[0].phase,'originals',JSON.stringify(s));assert.equal(s.jobs[0].eligible,1);for(let i=0;i<4;i++)s=await r.call('step');assert.equal(s.jobs[0].state,'done');assert.equal(state.tables.worker_pregame_originals.size,1);assert.equal(state.tables.worker_pregame_picks.size,0);}finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});

test('actual foreground NFL rankings across all 17 tabs remain responsive while cold capture owns an in-flight source',async()=>{const dir=await mkdtemp(join(tmpdir(),'actual-foreground-'));let r,unblock,entered;const signal=new Promise(resolve=>entered=resolve),state={blockFirst:true,denyLater:true,entered:()=>entered(),release:new Promise(resolve=>unblock=resolve)};try{await bundle(dir);r=await runtime(dir,state);const kv=await r.mf.getKVNamespace('VINEXT_KV_CACHE');const markets=['passing_yards','passing_tds','passing_interceptions','qb_rushing_yards','passing_rushing_yards','rushing_yards','receiving_yards','receptions','rushing_receiving_yards','anytime_td','first_td','sacks','tackles','tackles_assists','q1_passing_yards','q1_receiving_yards','q1_rushing_yards'];for(const market of markets)await kv.put('sach:pregame-board:v1:nfl:2026-11-15:'+market,JSON.stringify({capturedAt:now,pregameOnly:true,board:{...recorded[market],boardDay:'2026-11-15',featuredCapturedAt:new Date(now).toISOString()}}));await r.call('enqueue',{id:'concurrent-nfl',kind:'capture',sport:'nfl',market:'passing_yards',created:now});const job=r.call('step');void job.catch(error=>console.error('COLLECTION_ERROR',error.message));await signal;console.log('FOREGROUND_STAGE source entered');const response=await r.mf.dispatchFetch('https://test/api/nfl/rankings?market=passing_yards'),body=await response.json();assert.equal(response.status,200);console.log('FOREGROUND_RESPONSE',response.status,body.rows?.length,body.nflCoverage);assert.equal(body.nflCoverage.displayableRows,16);unblock();assert.equal((await job).jobs[0].phase,'originals');for(const market of markets){const response=await r.mf.dispatchFetch('https://test/api/nfl/rankings?market='+market),body=await response.json();assert.equal(response.status,200,market);assert.equal(body.rows.length,recorded[market].rows.length,market);assert.equal(body.nflCoverage.displayableRows,recorded[market].nflCoverage?.displayableRows||recorded[market].rows.length,market);}assert.equal(state.tables.worker_pregame_picks.size,0);}finally{unblock?.();await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});

test('actual NHL denied feed reports unavailable rather than a healthy empty ranking board',async()=>{const dir=await mkdtemp(join(tmpdir(),'actual-denied-nhl-'));let r;try{await bundle(dir);r=await runtime(dir,{denied:true});await r.call('clock',Date.parse('2026-11-15T15:53:00Z'));for(const market of ['shots_on_goal','points','goalie_saves','first_goal']){const response=await r.mf.dispatchFetch('https://test/api/nhl/rankings?market='+market),body=await response.json();assert.equal(body.success,false,JSON.stringify(body));assert.equal(body.dataState,'unavailable');assert.match(body.coverageNotice,market==='first_goal'?/sportsbook feed is unavailable/:/denied access \(403\)/);if(market!=='first_goal')assert.equal(body.verifiedQuoteCount,0);assert.equal(body.sourceCoverage.bookFeedCoverage.primary.status,403);}assert.equal(r.calls.filter(c=>c.url.includes('/game-log/')).length,0,'no priced players must not trigger fabricated history enrichment');}finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});

// Opt-in diagnostic replay of a withdrawn artifact; never used as a release artifact.
test('withdrawn production bundle reproduces opaque retry starvation under the same denied feed', {skip:!process.env.SACH_BASELINE_RUNTIME},async()=>{const dir=await mkdtemp(join(tmpdir(),'withdrawn-cold-'));let r;const state={denied:true};try{await bundle(dir);r=await runtime(dir,state);await r.call('enqueue',{id:'withdrawn-nfl',kind:'capture',sport:'nfl',market:'passing_yards',created:now});let s;for(let i=0;i<3;i++)s=await r.call('step');const job=s.jobs[0];console.log('WITHDRAWN_BASELINE',JSON.stringify({state:job.state,attempts:job.attempts,lastError:job.lastError,espnDenied:state.espnDenied,progress:job.progress}));assert.equal(job.state,'active');assert.equal(job.lastError,'rankings_unavailable');assert.ok(state.espnDenied>0);assert.equal(state.tables.worker_pregame_originals.size,0);}finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});

test('cold foreground NFL route reaches real official-source handling without a background redirect override',async()=>{const dir=await mkdtemp(join(tmpdir(),'actual-cold-foreground-nfl-'));let r;const state={};try{await bundle(dir);r=await runtime(dir,state);const response=await r.mf.dispatchFetch('https://test/api/nfl/rankings?market=passing_yards&day=2026-11-15'),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.ok(body.rows.some(row=>row.quoteVerified));assert.ok(body.nflCoverage.displayableRows>0);assert.ok(state.espnDenied>0,'official fetch must actually reach the intercepted denial, rather than fail redirect validation');assert.equal(state.tables.worker_pregame_picks.size,0);console.log('COLD_FOREGROUND_NFL',JSON.stringify({displayable:body.nflCoverage.displayableRows,officialDenials:state.espnDenied}));}finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}});

test('frozen candidate -> compatible fallback -> candidate retains pending evidence and resumes after lost ACK',
 {skip:process.env.SACH_COMPILED_RUNTIME!=='1'||!process.env.SACH_FALLBACK_BUNDLE},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'actual-rollback-'));let r;const state={loseAck:true};
 try {
  await bundle(dir);r=await runtime(dir,state);
  await r.call('enqueue',{id:'rollback-nfl',kind:'capture',sport:'nfl',market:'passing_yards',created:now});
  assert.equal((await r.call('step')).jobs[0].phase,'originals');
  const pending=await r.call('step');assert.match(pending.jobs[0].lastError,/storage HTTP 503/);
  const original=JSON.stringify([...state.tables.worker_pregame_originals.values()]);
  const evidence=(await r.call('inspect')).documents;
  console.log('ROLLBACK_STAGE','candidate checkpoint saved');
  await r.mf.dispose();await bundle(dir,process.env.SACH_FALLBACK_BUNDLE);r=await runtime(dir,state);
  console.log('ROLLBACK_STAGE','fallback constructed');
  const held=await r.call('inspect');assert.equal(held.status.jobs[0].phase,pending.jobs[0].phase);
  assert.deepEqual(held.documents,evidence,'fallback must retain checkpoint documents');
  assert.equal(JSON.stringify([...state.tables.worker_pregame_originals.values()]),original);
  await r.mf.dispose();await bundle(dir);r=await runtime(dir,state);
  let resumed;for(let i=0;i<6;i++)resumed=await r.call('step');
  assert.equal(resumed.jobs[0].state,'done');
  assert.equal(JSON.stringify([...state.tables.worker_pregame_originals.values()]),original);
  assert.equal(state.tables.worker_pregame_picks.size,0,'unvalidated forecast cannot become a bet during recovery');
  console.log('FROZEN_ROLLBACK',JSON.stringify({state:resumed.jobs[0].state,originals:state.tables.worker_pregame_originals.size,evidenceDocuments:evidence.length}));
 } finally {await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});

test('frozen shipping NBA/NFL/NHL official-final grading lanes complete and recover lost grade ACK independently',
 {skip:process.env.SACH_COMPILED_RUNTIME!=='1'},async()=>{
 // Entirely synthetic unit fixtures. These are neither historical selections
 // nor evidence of live grading; all writes target in-memory test maps only.
 const dir=await mkdtemp(join(tmpdir(),'shipping-grade-'));let r;
 const tables={worker_pregame_originals:new Map(),worker_pregame_picks:new Map(),worker_pregame_grades:new Map()};
 const state={tables,loseGradeAck:true,finalResponses:{}};
 const cases=[['nba','points','111'],['nfl','passing_yards','222'],['nhl','shots_on_goal','333']];
 const player='999101',gameTime='2026-11-15T08:00:00Z',captured='2026-11-15T07:00:00Z';
 for(const [sport,market,game]of cases){
  const pick={sport,market,game_id:game,player_id:player,game_date:'2026-11-15',game_time:gameTime,captured_at:captured,prediction_side:'OVER',sportsbook_line:2.5,checksum:'synthetic-'+sport,payload:{modelSelection:{side:'OVER',line:2.5,price:100,quoteId:'test-'+sport,sportsbookKey:'test-only',calculatedAt:captured},quote:{quoteId:'test-'+sport,sportsbookKey:'test-only',overPrice:100,underPrice:-120}}};
  tables.worker_pregame_picks.set([sport,market,game,player].join('|'),pick);
  const header={id:game,competitions:[{status:{type:{state:'post',completed:true}}}]};
  state.finalResponses[sport==='nhl'?'https://api-web.nhle.com/v1/gamecenter/'+game+'/boxscore':'https://site.api.espn.com/apis/site/v2/sports/'+(sport==='nba'?'basketball/nba':'football/nfl')+'/summary?event='+game]=sport==='nhl'?{id:game,gameState:'OFF',playerByGameStats:{awayTeam:{forwards:[{playerId:player,name:{default:'Test only'},sog:3,toi:'20:00'}]}}}:{header,boxscore:{players:[{team:{abbreviation:'TEST'},statistics:[sport==='nba'?{labels:['MIN','PTS','REB','AST'],athletes:[{athlete:{id:player,displayName:'Test only'},stats:['30','3','0','0']}]}:{name:'passing',labels:['C/ATT','YDS','TD','INT'],athletes:[{athlete:{id:player,displayName:'Test only'},stats:['1/1','3','0','0']}]}]}]}};
 }
 const before=JSON.stringify([...tables.worker_pregame_picks]);
 try{
  await bundle(dir);r=await runtime(dir,state);
  for(const [sport]of cases)await r.call('enqueue',{id:'grade-'+sport,kind:'grade',sport,created:now},'grade:'+sport);
  const maxima={};let restarted=false;
  for(let iteration=0;iteration<12;iteration++){
   const statuses=await Promise.all(cases.map(async([sport])=>{const status=await r.call('step',null,'grade:'+sport),job=status.jobs[0];maxima[sport]=Math.max(maxima[sport]||0,job.usage?.used||0);assert.ok((job.usage?.used||0)<=220);return job;}));
   if(statuses.some(j=>j.lastError)&&!restarted){assert.ok(statuses.some(j=>/grading save HTTP 503/.test(j.lastError||'')));await r.mf.dispose();r=await runtime(dir,state);restarted=true;}
   if(statuses.every(j=>j.state==='done'))break;
  }
  for(const [sport]of cases)assert.equal((await r.call('inspect',null,'grade:'+sport)).status.jobs[0].state,'done');
  assert.equal(tables.worker_pregame_grades.size,3);assert.ok([...tables.worker_pregame_grades.values()].every(g=>g.actual===3&&g.result_status==='hit'));
  assert.equal(JSON.stringify([...tables.worker_pregame_picks]),before);assert.equal(tables.worker_pregame_originals.size,0);assert.equal(restarted,true);
  console.log('SHIPPING_GRADING',JSON.stringify({grades:3,restarted,maxima}));
 }finally{await r?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
