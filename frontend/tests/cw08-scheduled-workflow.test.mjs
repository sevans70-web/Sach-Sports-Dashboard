import {gunzipSync} from 'node:zlib';
import test from 'node:test';import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {resolve,join} from 'node:path';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';import {buildShadow} from '../shadow/cw08/build.mjs';import {decodeShadowArtifacts} from '../scripts/cw08-cloudflare-artifacts.mjs';import {verifyShadowReceipt,gradeNhlShadow,canonical,digest} from '../scripts/nhl-shadow-evidence.mjs';
const root=resolve(import.meta.dirname,'..'),seed=JSON.parse(await readFile(resolve(root,'model-research/cw08-nhl-v3/cloudflare-shadow-manifests.json'))),pkg=seed.packages[0];
const bytes=await readFile(resolve(root,'model-research/cw08-nhl-v3',pkg.file)),files=decodeShadowArtifacts({sha256:pkg.packageSha256,chunks:[bytes.toString('base64')]}),receipts=files.filter(f=>f.path.startsWith('receipts/')).map(f=>JSON.parse(f.content));
const initial=Date.now()+5*60000,gameTime='2026-11-14T18:30:00.000Z',gameId='2026020999',playerId='999123',team='NJD',other='VGK',name='Shadow Testplayer';
const official={id:Number(gameId),season:20262027,gameType:2,startTimeUTC:gameTime,gameState:'FUT',awayTeam:{abbrev:team,name:{default:'New Jersey Devils'}},homeTeam:{abbrev:other,name:{default:'Vegas Golden Knights'}}};
let final=false,missing=false,failFeed=0,feedCalls=0,historyCalls=0,finalGoals=1;const outbound=[];
function answer(request){
 const u=new URL(request.url);outbound.push({url:request.url,method:request.method});assert.equal(request.method,'GET');assert.ok(['api-web.nhle.com','api.owlsinsight.com'].includes(u.hostname));
 if(u.hostname==='api.owlsinsight.com'){
  feedCalls++;assert.equal(request.headers.get('Authorization'),'Bearer synthetic-no-real-credential');if(failFeed-->0)return new Response('{}',{status:503});
  return Response.json({data:[{gameId,awayTeam:'New Jersey Devils',homeTeam:'Vegas Golden Knights',commenceTime:gameTime,books:[{key:'fixture_book',lastUpdate:new Date().toISOString(),props:['goals','assists'].map(category=>({category,period:'game',playerName:name,teamName:team,line:.5,overPrice:200,underPrice:-240,isMainLine:true,propId:category+'-'+playerId}))}]}]});
 }
 if(u.pathname.includes('/schedule/'))return Response.json({gameWeek:[{games:[official]}]});
 if(u.pathname.includes('/standings/'))return Response.json({standings:[{seasonId:20262027,teamAbbrev:{default:team},teamName:{default:'New Jersey Devils'},teamCommonName:{default:'Devils'}},{seasonId:20262027,teamAbbrev:{default:other},teamName:{default:'Vegas Golden Knights'},teamCommonName:{default:'Golden Knights'}}]});
 if(u.pathname.includes('/roster/'))return Response.json({forwards:u.pathname.includes('/'+team+'/')?[{id:Number(playerId),firstName:{default:'Shadow'},lastName:{default:'Testplayer'}}]:[],defensemen:[]});
 if(u.pathname.includes('/game-log/')){historyCalls++;const season=u.pathname.split('/').at(-2);return Response.json({gameLog:season==='20262027'?Array.from({length:8},(_,i)=>({gameId:2026000100+i,gameDate:'2026-11-0'+(i+1),teamAbbrev:team,opponentAbbrev:other,toi:'18:00',goals:i%2,assists:i%3,shots:2,points:i%2+i%3})):[]});}
 if(u.pathname.endsWith('/landing'))return Response.json({...official,gameState:final?'OFF':'FUT'});
 if(u.pathname.endsWith('/boxscore'))return Response.json({...official,gameState:final?'OFF':'LIVE',playerByGameStats:{awayTeam:{forwards:missing?[]:[{playerId:Number(playerId),goals:finalGoals,assists:0}],defense:[]},homeTeam:{forwards:[],defense:[]}}});
 throw Error('Unexpected source '+request.url);
}
async function setup(directory){const bundle=join(directory,'test-worker.mjs');await buildShadow(bundle,resolve(import.meta.dirname,'fixtures/cw08-runtime-entry.mjs'));
 const mf=new Miniflare(convertV4MiniflareOptions({name:'cw08-test',modules:true,modulesRoot:directory,scriptPath:bundle,compatibilityDate:'2026-11-11',compatibilityFlags:['nodejs_compat'],durableObjects:{STUDY:{className:'NhlShadowCoordinator',useSQLite:true}},resourcePersistencePath:join(directory,'storage'),kvNamespaces:['EVIDENCE'],bindings:{BOOTSTRAP_TOKEN:'local-bootstrap',OWLS_INSIGHT_API_KEY:'synthetic-no-real-credential'},outboundService:answer}));
 const call=async(action,value)=>{const r=await mf.dispatchFetch('https://shadow.test/__test',{method:'POST',body:JSON.stringify({action,value})});assert.equal(r.status,200,await r.clone().text());return r.json();};
 const status=async()=>{const r=await mf.dispatchFetch('https://shadow.test/status');return r.json();};return {mf,call,status};
}
test('scheduled Cloudflare workflow preserves seeds, serializes, recovers uploads and auto-grades exact finals',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'cw08-runtime-'));let runtime;
 try{
  runtime=await setup(dir);let {mf,call,status}=runtime;
  assert.equal((await call('tick')).state,'bootstrap_pending');assert.equal(feedCalls,0);
  assert.equal((await mf.dispatchFetch('https://shadow.test/bootstrap',{method:'POST',body:'{}'})).status,401);
  assert.equal((await mf.dispatchFetch('https://shadow.test/collect',{method:'POST'})).status,404);
  // The authenticated production bootstrap route imports only known anchored seeds.
  const firstBody=JSON.stringify(receipts[0]);const imported=await mf.dispatchFetch('https://shadow.test/bootstrap',{method:'POST',headers:{Authorization:'Bearer local-bootstrap','Content-Length':String(Buffer.byteLength(firstBody))},body:firstBody});assert.equal(imported.status,200,await imported.clone().text());
  // Every real November 14 receipt reproduces in workerd before any new enrollment.
  for(const r of receipts){verifyShadowReceipt(r);await call('bootstrap',r);}
  assert.equal((await status()).ready,true);assert.equal((await status()).receipts,339);
  await call('bootstrap',receipts[0]);assert.equal((await status()).receipts,339);
  const bad=structuredClone(receipts[0]);bad.quote.line=1.5;const {sha256,...body}=bad;bad.sha256=digest(body);await assert.rejects(call('bootstrap',bad));
  await call('clock',initial);const worker=await mf.getWorker();await worker.scheduled({cron:'*/15 * * * *',scheduledTime:initial});await Promise.all([call('tick'),call('tick'),call('tick')]);assert.equal((await status()).active.length,1);
  // A held persisted lease fences concurrent alarm deliveries.
  await call('lease',{token:'other-owner',until:initial+120000});const before=await call('inspect');await call('step');assert.deepEqual((await call('inspect')).cycles,before.cycles);await call('clearLease');
  failFeed=1;
  for(let i=0;i<20;i++){const s=await status();if(s.active[0]?.lastError)break;await call('step');}
  let s=await status();if(s.active[0].lastError!=='source_http_503')console.log((await call('inspect')).testError);assert.equal(s.active[0].lastError,'source_http_503');assert.equal(s.active[0].retries,1);const callsAtFailure=feedCalls;await call('step');assert.equal(feedCalls,callsAtFailure);
  await call('clock',initial+31000);
  // Interrupt the first durable object upload, evict/restart, and recover its exact bytes.
  await call('fault','after_put');
  for(let i=0;i<25;i++){await call('step');if((await call('inspect')).storageError)break;}
  let inspected=await call('inspect');assert.equal(inspected.storageError.code,'injected_ack_loss');assert.ok((await status()).pendingUploads>0);
  await mf.dispose();runtime=await setup(dir);({mf,call,status}=runtime);assert.equal((await status()).ready,true);assert.equal((await status()).receipts,341);await call('clock',(await status()).active[0].retryAt+1);
  for(let i=0;i<60&&(await status()).completedCycles===0;i++)await call('step');
  s=await status();if(s.receipts!==341)console.log((await call('inspect')).cycles.map(r=>JSON.parse(r.data)));assert.equal(s.completedCycles,1);assert.equal(s.receipts,341);assert.equal(s.pendingUploads,0);assert.equal(s.grades,0);assert.ok(s.manifestHead);
  inspected=await call('inspect');const newRows=inspected.receipts.filter(r=>r.game_id===gameId);assert.equal(newRows.length,2);const firstSha=newRows.map(r=>r.sha),firstRefs=newRows.map(r=>r.object_key),firstManifest=s.manifestHead;
  await call('clock',initial+SLOT_FOR_TEST);await call('tick');for(let i=0;i<45&&(await status()).active.length;i++)await call('step');
  assert.equal((await status()).receipts,341);assert.deepEqual((await call('inspect')).receipts.filter(r=>r.game_id===gameId).map(r=>r.sha),firstSha);assert.equal(historyCalls,4,'same-day history is retained without refetch');
  // Finality and participant checks stay pending without invented zeroes.
  await call('clock',Date.parse(gameTime)+4*3600000);await call('tick');for(let i=0;i<40&&(await status()).active.length;i++)await call('step');assert.equal((await status()).grades,0);
  final=true;missing=true;await call('clock',Date.parse(gameTime)+5*3600000);await call('tick');for(let i=0;i<40&&(await status()).active.length;i++)await call('step');assert.equal((await status()).grades,0);
  final=true;missing=false;await call('clock',Date.parse(gameTime)+12*3600000);await call('fault','grade_after_put');await call('tick');
  for(let i=0;i<100&&(await status()).lastStorageError?.code!=='injected_grade_ack_loss';i++)await call('step');
  assert.equal((await status()).lastStorageError.code,'injected_grade_ack_loss');const reservedGradeHashes=(await call('inspect')).receipts.filter(r=>r.game_id===gameId).map(r=>r.grade_sha);finalGoals=9;await call('clock',(await status()).active[0].retryAt+1);
  for(let i=0;i<100&&(await status()).active.length;i++)await call('step');
  assert.deepEqual((await call('inspect')).receipts.filter(r=>r.game_id===gameId).map(r=>r.grade_sha),reservedGradeHashes);
  s=await status();assert.equal(s.grades,2);assert.equal(s.receipts,341);inspected=await call('inspect');const graded=inspected.receipts.filter(r=>r.game_id===gameId);assert.ok(graded.every(r=>r.grade_sha));assert.deepEqual(graded.map(r=>r.object_key),firstRefs);
  const bucket=await mf.getKVNamespace('EVIDENCE');const decode=async key=>{const wrapper=JSON.parse(await bucket.get(key)),text=gunzipSync(Buffer.from(wrapper.gzipBase64,'base64')).toString('utf8');assert.equal(digest(text),wrapper.sha256);return JSON.parse(text);};for(const row of graded){const receipt=await decode(row.object_key),grade=await decode(row.grade_key),{official:result,...saved}=grade;assert.equal(digest(canonical(receipt)),inspected.objects.find(o=>o.key===row.object_key).hash);assert.deepEqual(gradeNhlShadow(receipt,result,Date.parse(grade.gradedAt)),saved);assert.equal(grade.actual,row.market==='goals'?1:0);}
  assert.equal(s.latestSummary.results.goals.all.settled,1);assert.equal(s.latestSummary.results.assists.all.settled,1);assert.equal(s.latestSummary.results.goals.all.evidenceGates.minimumFinalFixtures,false);
  const oldGrades=graded.map(r=>r.grade_sha);await call('clock',Date.parse(gameTime)+13*3600000);await call('tick');for(let i=0;i<100&&(await status()).active.length;i++)await call('step');assert.deepEqual((await call('inspect')).receipts.filter(r=>r.game_id===gameId).map(r=>r.grade_sha),oldGrades);
  // Enrollment closes on the frozen date; grading and recovery remain available.
  const feedAtClose=feedCalls;await call('clock',Date.parse('2026-12-15T12:00:00Z'));await call('tick');for(let i=0;i<100&&(await status()).active.length;i++)await call('step');assert.equal(feedCalls,feedAtClose);
  assert.ok(outbound.every(r=>r.method==='GET'));assert.equal((await status()).releaseApproved,false);
 }finally{await runtime?.mf.dispose();await rm(dir,{recursive:true,force:true});}
});
const SLOT_FOR_TEST=15*60000;
