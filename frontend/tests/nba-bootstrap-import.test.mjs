import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {rolldown} from 'rolldown';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {importMechanism} from '../scripts/nba-bootstrap-import-cli.mjs';
const planPath=resolve('../docs/audits/2026-11-17-nba-bootstrap-plan/finals-only-plan.json.gz');
const plan=JSON.parse(gunzipSync(await readFile(planPath)));
const account='0123456789abcdef0123456789abcdef',shaMarker='b'.repeat(64);
function auth(m,s,operation='import'){return {operation,sessionDigest:s.digest,planDigest:s.manifest.planDigest,approvalReference:'OFFLINE-TEST-ONLY-not-production-approval',expiresAt:new Date(Date.now()+25*60000).toISOString(),consumerInactive:true,fallbackVersion:m.BOOTSTRAP_FALLBACK,protectedRecordBaselineSha256:shaMarker};}
const options=(m,s,request,operation='import')=>({account,authorization:auth(m,s,operation),request,assertSafety:async()=>({fallbackVersion:m.BOOTSTRAP_FALLBACK,researchDeployment:m.BOOTSTRAP_RESEARCH,buildsPaused:true,protectedRecordSha256:shaMarker})});

test('single-statement API-shaped imports are bounded, resumable and atomic in actual SQLite workerd',{timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-import-runtime-'));let mf;
 try{
  const m=await importMechanism(dir);
  await writeFile(join(dir,'runtime.mjs'),`import {DurableObject} from 'cloudflare:workers';
import {nbaEvidenceStore} from '${resolve('jobs/nba-evidence-store.mjs')}';
export class IsolatedImport extends DurableObject {
 constructor(ctx,env){super(ctx,env);this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS protected_marker(kind TEXT PRIMARY KEY,body TEXT)');for(const kind of ['history','originals','picks','grades','nfl','nhl','cw08-marker'])this.sql.exec('INSERT OR IGNORE INTO protected_marker VALUES(?,?)',kind,'original-'+kind);}
 query(q){try{const c=this.sql.exec(q.sql,...q.params);const rows=[...c];return {success:true,errors:[],result:{results:[{columns:c.columnNames,rows:rows.map(r=>c.columnNames.map(k=>r[k])),meta:{rows_read:c.rowsRead,rows_written:c.rowsWritten}}]}};}catch(e){return {success:true,errors:[],result:{error:e.message,results:[]}};}}
 seed(e){return nbaEvidenceStore(this.sql).write(e);}
 read(source){return nbaEvidenceStore(this.sql).read(source);}
}
export default {async fetch(r,env){const v=await r.json(),o=env.ISOLATED.getByName(v.lane);return Response.json(v.action==='seed'?await o.seed(v.evidence):v.action==='read'?await o.read(v.source):await o.query(v.query));}};`);
  const b=await rolldown({input:join(dir,'runtime.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'alias',resolveId(id){if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts');}}]});await b.write({file:join(dir,'worker.mjs'),format:'esm'});await b.close();
  const boot=()=>{const o=convertV4MiniflareOptions({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],resourcePersistencePath:join(dir,'state'),durableObjects:{ISOLATED:{className:'IsolatedImport',useSQLite:true}},outboundService:()=>{throw Error('No network permitted');}});o.workers[0].config.limits={subrequests:350,cpuMs:30000};return new Miniflare(o);};
  mf=await boot();
  const rpc=async(lane,value)=>{const r=await mf.dispatchFetch('https://isolated.test/',{method:'POST',body:JSON.stringify({lane,...value})});assert.equal(r.status,200);return r.json();};
  const raw=(lane,sql,params=[])=>rpc(lane,{query:{sql,params}});
  const q=lane=>async query=>m.decodeQueryResponse(await rpc(lane,{query}));
  const request=lane=>async r=>{
   assert.equal(r.method,'POST');assert.equal(r.path,`/accounts/${account}/workers/durable_objects/namespaces/${m.NBA_BOOTSTRAP_TARGET.namespace}/query/v2`);assert.equal(r.body.durable_object_name,'capture:nba');assert.equal(r.body.queries.length,1);assert.equal(r.body.jurisdiction,'none');assert.ok(r.body.queries[0].params.length<=100);assert.ok(Buffer.byteLength(r.body.queries[0].sql)<=100*1024);
   return rpc(lane,{query:r.body.queries[0]});
  };
  const snapshot=lane=>m.readImportSnapshot(plan.entries.map(e=>e.evidence.source),q(lane));
  const count=async(lane,table)=>(await q(lane)({sql:`SELECT COUNT(*) n FROM ${table}`,params:[]}))[0].n;
  const journal=(lane,s)=>q(lane)(m.journalQuery(s.run));
  const protectedRows=lane=>q(lane)({sql:'SELECT * FROM protected_marker ORDER BY kind',params:[]});
  await rpc('main',{action:'seed',evidence:plan.entries[0].evidence});const before=await snapshot('main'),markers=await protectedRows('main');
  const s=m.createImportSession(plan,before,Date.now());assert.equal(s.manifest.newChecks.length,100);assert.equal(s.manifest.beforeChecks.length,1);
  for(const query of m.stageQueries(s)){assert.ok(JSON.parse(query.params[0]).length<=10);assert.ok(Buffer.byteLength(query.params[0])<=128*1024);}
  let stages=0;const interrupted=async r=>{const response=await request('main')(r);if(r.body.queries[0].sql.startsWith('WITH items')&&++stages===2)throw Error('lost-stage-ack');return response;};
  await assert.rejects(m.executePreparedBootstrap(s,options(m,s,interrupted)),/lost-stage-ack/);
  assert.equal(await count('main','nba_history_checks'),1);assert.equal(await count('main','nba_history_versions'),20);
  const first=await m.executePreparedBootstrap(s,options(m,s,request('main')));assert.equal(first.ownedPointers.length,100);assert.ok(first.calls<=90);
  const after=await snapshot('main');assert.deepEqual(after.checks.find(c=>c.source===before.checks[0].source),before.checks[0]);assert.deepEqual(after.versions.find(c=>c.source===before.versions[0].source),before.versions[0]);
  for(const e of plan.entries){const recovered=await rpc('main',{action:'read',source:e.evidence.source});assert.equal(recovered.sha256,e.evidence.sha256);assert.equal(recovered.observedAt,e.evidence.observedAt);assert.equal(recovered.lastVerifiedAt,e.evidence.lastVerifiedAt);}
  const events=await journal('main',s);assert.deepEqual(events.map(x=>x.kind).sort(),['manifest','publish']);
  await m.executePreparedBootstrap(s,options(m,s,request('main')));assert.deepEqual(await snapshot('main'),after);assert.deepEqual(await journal('main',s),events);assert.deepEqual(await protectedRows('main'),markers);
  await mf.dispose();mf=await boot();assert.deepEqual(await snapshot('main'),after);assert.deepEqual(await journal('main',s),events);
  const rollbackLost=async r=>{const response=await request('main')(r);if(r.body.queries[0].params?.[2]==='rollback')throw Error('lost-rollback-ack');return response;};
  await assert.rejects(m.executePreparedBootstrap(s,options(m,s,rollbackLost,'rollback')),/lost-rollback-ack/);
  await m.executePreparedBootstrap(s,options(m,s,request('main'),'rollback'));assert.equal(await count('main','nba_history_checks'),1);assert.equal(await count('main','nba_history_versions'),101);assert.deepEqual(await protectedRows('main'),markers);
  assert.deepEqual((await snapshot('main')).checks,before.checks);await assert.rejects(m.executePreparedBootstrap(s,options(m,s,request('main'))),/run_closed/);
  const reattach=m.createImportSession(plan,await snapshot('main'),Date.now());await m.executePreparedBootstrap(reattach,options(m,reattach,request('main')));assert.equal(await count('main','nba_history_checks'),101);
  const lost=m.createImportSession(plan,await snapshot('lost-publish'),Date.now());
  const lostRequest=async r=>{const response=await request('lost-publish')(r);if(r.body.queries[0].params?.[2]==='publish')throw Error('lost-publish-ack');return response;};
  await assert.rejects(m.executePreparedBootstrap(lost,options(m,lost,lostRequest)),/lost-publish-ack/);assert.equal(await count('lost-publish','nba_history_checks'),101);
  await m.executePreparedBootstrap(lost,options(m,lost,request('lost-publish')));assert.equal((await journal('lost-publish',lost)).filter(e=>e.kind==='publish').length,1);
  const advanced=lost.manifest.newChecks[0];await raw('lost-publish','UPDATE nba_history_checks SET verified=? WHERE source=?',[new Date(Date.parse(advanced.verified)+1000).toISOString(),advanced.source]);const later=await snapshot('lost-publish');
  await assert.rejects(m.executePreparedBootstrap(lost,options(m,lost,request('lost-publish'),'rollback')),/response_invalid/);assert.deepEqual(await snapshot('lost-publish'),later);assert.equal((await journal('lost-publish',lost)).filter(e=>e.kind==='rollback').length,0);
  const raced=m.createImportSession(plan,await snapshot('race'),Date.now());let racedOnce=false;
  const raceRequest=async r=>{if(!racedOnce&&r.body.queries[0].params?.[2]==='publish'){racedOnce=true;const c=raced.manifest.newChecks[0];await raw('race','INSERT INTO nba_history_checks VALUES(?,?,?)',[c.source,c.sha,new Date(Date.parse(c.verified)+1000).toISOString()]);}return request('race')(r);};
  await assert.rejects(m.executePreparedBootstrap(raced,options(m,raced,raceRequest)),/response_invalid/);assert.equal(await count('race','nba_history_checks'),1);assert.equal((await journal('race',raced)).filter(e=>e.kind==='publish').length,0);
  for(const [lane,fault] of [['conflict',['conflicting-revision','not-a-census',12]],['null-conflict',[null,null,null]]]){
   const conflict=m.createImportSession(plan,await snapshot(lane),Date.now());let injected=false;
   const conflictRequest=async r=>{if(!injected&&r.body.queries[0].sql.startsWith('WITH items')){injected=true;const v=conflict.manifest.versions[0];await raw(lane,'INSERT INTO nba_history_versions VALUES(?,?,?,?)',[v.source,...fault]);}return request(lane)(r);};
   await assert.rejects(m.executePreparedBootstrap(conflict,options(m,conflict,conflictRequest)),/stage_readback/);assert.equal(await count(lane,'nba_history_versions'),1);assert.equal(await count(lane,'nba_history_checks'),0);
  }
  // A storage error during the AFTER trigger must undo the journal event
  // and every pointer inserted by that statement, not just the failing row.
  const partial=m.createImportSession(plan,await snapshot('partial-apply'),Date.now());let faultAdded=false;
  const failApply=async r=>{if(!faultAdded&&r.body.queries[0].params?.[2]==='publish'){faultAdded=true;const source=partial.manifest.newChecks[1].source;assert.match(source,/^https:[a-zA-Z0-9:/?.=&_-]+$/);await raw('partial-apply',`CREATE TRIGGER injected_disk_fault BEFORE INSERT ON nba_history_checks WHEN NEW.source='${source}' BEGIN SELECT RAISE(ABORT,'isolated_storage_fault'); END`);}return request('partial-apply')(r);};
  await assert.rejects(m.executePreparedBootstrap(partial,options(m,partial,failApply)),/response_invalid/);assert.equal(await count('partial-apply','nba_history_checks'),0);assert.equal((await journal('partial-apply',partial)).filter(e=>e.kind==='publish').length,0);assert.equal(await count('partial-apply','nba_history_versions'),101);
  await raw('partial-apply','DROP TRIGGER injected_disk_fault');await m.executePreparedBootstrap(partial,options(m,partial,request('partial-apply')));assert.equal(await count('partial-apply','nba_history_checks'),101);
  await q('main')(m.eventQuery(reattach,'consume'));await assert.rejects(m.executePreparedBootstrap(reattach,options(m,reattach,request('main'),'rollback')),/consumed/);assert.equal(await count('main','nba_history_checks'),101);
  assert.ok((await raw('main','UPDATE nba_bootstrap_events SET body=?',['{}'])).result.error.includes('journal_immutable'));assert.ok((await raw('main','DELETE FROM nba_bootstrap_events')).result.error.includes('journal_immutable'));assert.deepEqual(await protectedRows('main'),markers);
  assert.ok((await raw('main',"INSERT OR REPLACE INTO nba_bootstrap_events(event,run,kind,body) VALUES(?,?,?,?)",['manifest:'+reattach.run,reattach.run,'manifest',JSON.stringify(reattach.manifest)])).result.error.includes('journal_immutable'));
  console.log('NBA_IMPORT_TRANSPORT',JSON.stringify({sources:101,existingPointerPreserved:1,ownedPointers:100,stageLostAckRecovered:true,publishLostAckRecovered:true,rollbackLostAckRecovered:true,restart:true,atomicPublicationConflict:true,atomicStagingConflict:true,nullSafeConflict:true,partialPublicationRolledBack:true,laterCollectionRollbackRefused:true,consumptionLock:true,immutableJournal:true,protectedMarkersUnchanged:true,allSourceHashTimesVerified:true,maxBatchSources:10,maxParams:4,calls:first.calls,actualNetworkCalls:0,productionAccess:false}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('authorization/schema/package gates fail before writes; file bridge cannot send or silently resend requests',{timeout:30000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-import-gates-'));
 try{
  const m=await importMechanism(dir),empty={schema:[],versions:[],checks:[],totalBytes:0},s=m.createImportSession(plan,empty,Date.now());let writes=0;const request=async()=>{writes++;throw Error('must not reach transport');};
  const a=options(m,s,request);a.authorization.operation='not-import';await assert.rejects(m.executePreparedBootstrap(s,a),/separate_authorization/);assert.equal(writes,0);
  const b=options(m,s,request);b.assertSafety=async()=>({fallbackVersion:'candidate-not-fallback',buildsPaused:true});await assert.rejects(m.executePreparedBootstrap(s,b),/safety_gate/);assert.equal(writes,0);
  const expired=options(m,s,request);expired.authorization.expiresAt=new Date(Date.now()-1000).toISOString();await assert.rejects(m.executePreparedBootstrap(s,expired),/separate_authorization/);assert.equal(writes,0);
  assert.throws(()=>m.bootstrapRequest('wrong-account',{sql:'SELECT 1',params:[]}),/account_invalid/);
  const forged=structuredClone(s);forged.manifest.newChecks[0].verified=new Date().toISOString();assert.throws(()=>m.verifyImportSession(forged),/checksum/);
  assert.throws(()=>m.verifyBootstrapSchema([{name:'nba_history_versions',sql:'CREATE TABLE nba_history_versions(secret TEXT)'}]),/unrecognized_schema/);
  assert.throws(()=>m.createImportSession(plan,{...empty,totalBytes:64*1024*1024},Date.now()),/capacity/);
  assert.throws(()=>m.decodeQueryResponse({success:true,result:{error:'denied',results:[]}}),/response_invalid/);
  const snapshotPath=join(dir,'snapshot.json'),sessionPath=join(dir,'session.gz'),authorizationPath=join(dir,'authorization.json'),proofPath=join(dir,'proof.json'),transcriptPath=join(dir,'transcript.json');await writeFile(snapshotPath,JSON.stringify(empty));
  const cli=(...args)=>spawnSync(process.execPath,['scripts/nba-bootstrap-import-cli.mjs',...args],{encoding:'utf8',maxBuffer:5*1024*1024});
  const prepared=cli('--prepare',planPath,snapshotPath,sessionPath);assert.equal(prepared.status,0,prepared.stderr);const session=JSON.parse(gunzipSync(await readFile(sessionPath)));assert.equal(session.manifest.newChecks.length,101);
  await writeFile(authorizationPath,JSON.stringify(auth(m,session)));await writeFile(proofPath,JSON.stringify({accountId:account,checkedAt:new Date().toISOString(),consumerInactiveConfirmed:true,releaseFreezeConfirmed:true,fallbackVersion:m.BOOTSTRAP_FALLBACK,buildsPaused:true,researchDeployment:m.BOOTSTRAP_RESEARCH,protectedRecordSha256:shaMarker}));
  const next=()=>cli('--next',sessionPath,authorizationPath,proofPath,transcriptPath);const step=next();assert.equal(step.status,0,step.stderr);const emitted=JSON.parse(step.stdout);assert.equal(emitted.networkCalls,0);assert.ok(emitted.request.body.queries[0].sql.startsWith('SELECT'));assert.notEqual(next().status,0);
  const responsePath=join(dir,'response.json');await writeFile(responsePath,JSON.stringify({success:true,errors:[],result:{results:[{columns:[],rows:[],meta:{rows_written:0,rows_read:0}}]}}));assert.equal(cli('--ack',transcriptPath,responsePath).status,0);const second=next();assert.equal(second.status,0,second.stderr);assert.ok(JSON.parse(second.stdout).request.body.queries[0].sql.startsWith('CREATE TABLE'));
  const resumed=cli('--resume',sessionPath,authorizationPath,proofPath,transcriptPath);assert.equal(resumed.status,0,resumed.stderr);assert.ok(JSON.parse(resumed.stdout).request.body.queries[0].sql.startsWith('SELECT'));assert.ok(JSON.parse(await readFile(transcriptPath+'.attempt-1.json')).pending);assert.notEqual(cli('--execute').status,0);assert.equal(writes,0);
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('ambiguous transport timeout stops after one request without an automatic retry',{timeout:20000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-import-deadline-'));
 try{const m=await importMechanism(dir),s=m.createImportSession(plan,{schema:[],versions:[],checks:[],totalBytes:0},Date.now());let calls=0;
  const started=Date.now();await assert.rejects(m.executePreparedBootstrap(s,options(m,s,()=>{calls++;return new Promise(()=>{});})),/ambiguous_timeout_stop_and_resume_same_run/);
  assert.equal(calls,1);assert.ok(Date.now()-started>=14500&&Date.now()-started<19000);
 }finally{await rm(dir,{recursive:true,force:true});}
});
