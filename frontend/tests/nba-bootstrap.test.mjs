import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {rolldown} from 'rolldown';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {bootstrapModules,loadRetainedNba} from '../scripts/plan-nba-bootstrap.mjs';

test('complete retained NBA inventory obeys original receipts and excludes stale discovery',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-bootstrap-inventory-'));
 try{const m=await bootstrapModules(dir),r=await loadRetainedNba(dir),now=Date.now(),x=m.inspectRetainedNbaSources(r.records,now);
  assert.equal(x.summary.retainedResponses,224);assert.equal(x.plan.entries.length,101);assert.equal(x.summary.freshDiscoveries,0);assert.equal(x.summary.observations,16242);
  assert.equal(x.inventory.filter(r=>r.reason==='original_http_receipt_unknown').length,34);assert.equal(x.inventory.filter(r=>r.status==='stale_discovery_reference_only').length,50);
  assert.ok(x.plan.entries.every(r=>r.evidence.kind==='fixture'&&r.evidence.observedAt===r.provenance.originalObservedAt&&r.evidence.lastVerifiedAt===r.evidence.observedAt));
  assert.ok(r.archives.filter(a=>a.archive.startsWith('model-research/')&&a.records>0).every(a=>a.parentReceiptVerified));
  assert.equal(m.verifyBootstrapPlan(x.plan,now),true);
  const changed=structuredClone(x.plan);changed.entries[0].evidence.observedAt=new Date(now).toISOString();assert.throws(()=>m.verifyBootstrapPlan(changed,now),/checksum/);
  const stale=x.inventory.filter(r=>r.kind==='discovery');assert.ok(stale.every(r=>r.fresh===false));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('actual SQLite Durable Object accepts insert-only bootstrap, survives restart, and rolls back without touching existing/later records',{timeout:120000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-bootstrap-runtime-'));let mf;
 try{const m=await bootstrapModules(dir),r=await loadRetainedNba(dir),now=Date.now(),plan=m.inspectRetainedNbaSources(r.records,now).plan;
  const entry=`import {DurableObject} from 'cloudflare:workers';
import {nbaEvidenceStore} from '${resolve('jobs/nba-evidence-store.mjs')}';
import {rehearseBootstrap,rehearseBootstrapRollback} from '${resolve('scripts/nba-bootstrap-plan.ts')}';
export class BootstrapQueue extends DurableObject{
 constructor(ctx,env){super(ctx,env);this.sql=ctx.storage.sql;this.sql.exec('CREATE TABLE IF NOT EXISTS protected_records(kind TEXT PRIMARY KEY,body TEXT)');}
 store(){return nbaEvidenceStore(this.sql,()=>${now}+10000);}
 snapshot(){const tables=[...this.sql.exec("SELECT name FROM sqlite_master WHERE type='table'")].map(r=>r.name);return {protected:[...this.sql.exec('SELECT * FROM protected_records ORDER BY kind')],checks:tables.includes('nba_history_checks')?[...this.sql.exec('SELECT * FROM nba_history_checks ORDER BY source')]:[],versions:tables.includes('nba_history_versions')?[...this.sql.exec('SELECT source,sha,body,bytes FROM nba_history_versions ORDER BY source,sha')]:[]};}
 control(a,v){
  if(a==='seed'){for(const kind of ['history','original_receipts','saved_picks','grades','nba-existing-evidence','nfl','nhl'])this.sql.exec('INSERT OR IGNORE INTO protected_records VALUES(?,?)',kind,JSON.stringify({at:'original-time',value:kind}));return this.snapshot();}
  if(a==='snapshot')return this.snapshot();
  if(a==='apply')return rehearseBootstrap(this.sql,this.store(),v,${now}+10000,work=>this.ctx.storage.transactionSync(work));
  if(a==='interrupt'){const store=this.store();let writes=0;return rehearseBootstrap(this.sql,{...store,write:e=>{if(++writes===3)throw Error('simulated_interrupted_import');return store.write(e);}},v,${now}+10000,work=>this.ctx.storage.transactionSync(work));}
  if(a==='rollback')return rehearseBootstrapRollback(this.sql,v,work=>this.ctx.storage.transactionSync(work));
  if(a==='advance')this.sql.exec('UPDATE nba_history_checks SET verified=? WHERE source=?',v.at,v.source);
  if(a==='corrupt')this.sql.exec('UPDATE nba_history_checks SET sha=? WHERE source=?','storage-fault-contract',v.source);
  if(a==='read')return this.store().read(v);
 }
}
export default{async fetch(r,env){const {action,value,lane}=await r.json();try{return Response.json({result:await env.TEST_BOOTSTRAP.getByName(lane||'isolated-bootstrap').control(action,value)});}catch(e){return Response.json({error:e.message});}}};`;
  await writeFile(join(dir,'runtime-entry.mjs'),entry);const b=await rolldown({input:join(dir,'runtime-entry.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'app-aliases',resolveId(id){if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts');}}]});await b.write({file:join(dir,'worker.mjs'),format:'esm'});await b.close();
  const boot=()=>{const o=convertV4MiniflareOptions({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],resourcePersistencePath:join(dir,'storage'),durableObjects:{TEST_BOOTSTRAP:{className:'BootstrapQueue',useSQLite:true}},outboundService:()=>{throw Error('Bootstrap rehearsal forbids network access');}});o.workers[0].config.limits={subrequests:350,cpuMs:30000};return new Miniflare(o);};
  const call=async(action,value,lane)=>{const r=await mf.dispatchFetch('https://isolated.test/bootstrap',{method:'POST',body:JSON.stringify({action,value,lane})});assert.equal(r.status,200);return r.json();};
  mf=await boot();const before=(await call('seed')).result;
  assert.match((await call('interrupt',plan)).error,/interrupted_import/);assert.deepEqual((await call('snapshot')).result,before,'transaction abort must roll back partial evidence writes and preserve original rows');
  // Pre-existing real source pointer must remain byte-identical, including its
  // original receipt/check timestamps; a duplicate cannot restamp it.
  const one={...plan,entries:plan.entries.slice(0,1)};delete one.digest;one.digest=m.bootstrapSha(one);
  const preReceipt=(await call('apply',one)).result;assert.equal(preReceipt.inserted.length,1);
  const preExisting=(await call('snapshot')).result,receipt=(await call('apply',plan)).result;assert.equal(receipt.inserted.length,100);assert.equal(receipt.duplicates,1);
  const after=(await call('snapshot')).result;assert.deepEqual(after.protected,before.protected);assert.deepEqual(after.versions.find(v=>v.source===one.entries[0].evidence.source),preExisting.versions[0]);assert.equal(after.checks.length,101);
  const duplicate=(await call('apply',plan)).result;assert.equal(duplicate.inserted.length,0);assert.equal(duplicate.duplicates,101);assert.deepEqual((await call('snapshot')).result,after);
  for(const {evidence:e} of plan.entries){const saved=(await call('read',e.source)).result;assert.equal(saved.sha256,e.sha256);assert.equal(saved.observedAt,e.observedAt);assert.equal(saved.lastVerifiedAt,e.lastVerifiedAt);}
  await mf.dispose();mf=await boot();assert.deepEqual((await call('snapshot')).result,after,'restart must preserve exact checksummed bodies and original records');
  const forged=structuredClone(receipt);forged.inserted[0].source=one.entries[0].evidence.source;assert.match((await call('rollback',forged)).error,/receipt_checksum/);assert.deepEqual((await call('snapshot')).result,after);
  const rolled=(await call('rollback',receipt)).result;assert.equal(rolled.deactivated,100);const reset=(await call('snapshot')).result;assert.deepEqual(reset.protected,before.protected);assert.deepEqual(reset.checks,preExisting.checks);assert.deepEqual(reset.versions,after.versions,'rollback retains immutable audit bodies');
  const resumed=(await call('apply',plan)).result;assert.equal(resumed.inserted.length,100,'safe reattachment of identical staged versions must resume idempotently');
  const introduced=receipt.inserted[0];await call('advance',{source:introduced.source,at:new Date(now+10000).toISOString()});const later=(await call('snapshot')).result;
  assert.match((await call('rollback',resumed)).error,/later_evidence/);assert.deepEqual((await call('snapshot')).result,later,'failed rollback cannot undo later successful collection');
  assert.match((await call('rollback',{...resumed,consumerActivated:true})).error,/logical_fallback/);assert.deepEqual((await call('snapshot')).result,later);
  await call('seed',null,'isolated-conflict');await call('apply',one,'isolated-conflict');await call('corrupt',{source:one.entries[0].evidence.source},'isolated-conflict');const conflict=(await call('snapshot',null,'isolated-conflict')).result;
  assert.match((await call('apply',plan,'isolated-conflict')).error,/existing_source_conflict/);assert.deepEqual((await call('snapshot',null,'isolated-conflict')).result,conflict,'conflict preflight must prevent partial insertion');
  console.log('NBA_BOOTSTRAP_REHEARSAL',JSON.stringify({finals:101,firstRunInserted:receipt.inserted.length,existingDuplicateUntouched:1,duplicateRunInserted:duplicate.inserted.length,checksumAndOriginalTimeReadbacks:101,restartExact:true,rollbackDeactivatedOnlyNew:rolled.deactivated,immutableVersionsRetained:true,laterCollectionPreserved:true,allProtectedRecordsUnchanged:true,networkCalls:0,productionAccess:false}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});

test('bootstrap planning CLI has no deployment or production import mode',()=>{
 for(const flag of ['--apply','--deploy','--import']){const r=spawnSync(process.execPath,[resolve('scripts/plan-nba-bootstrap.mjs'),flag,'/tmp/not-used-bootstrap'],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/Offline only/);}
});
