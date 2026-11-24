import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareStabilityRelease,stabilityRelease} from '../scripts/prepare-r1-stability-release.mjs';
import {fingerprint} from '../scripts/prepare-dashboard-retry-release.mjs';
test('stability artifact restores every exact file, retains model holds/bindings, and detects tampering',()=>{
 const output=mkdtempSync(join(tmpdir(),'r1-stability-'));
 try{
  const m=JSON.parse(readFileSync(join(stabilityRelease,'manifest.json'))),restored=prepareStabilityRelease(output);
  assert.equal(restored.digest,m.bundleDigest);assert.equal(restored.artifact,m.artifact);
  assert.equal(m.productionDeployed,false);assert.equal(m.approvalRequired,true);assert.equal(m.previousAuthorizationApplies,false);
  assert.equal(m.protectedBackupRecords,20904);assert.equal(m.probabilityModelPromotion,false);
  assert.equal(m.runtime.newNamespaces,0);assert.equal(m.runtime.newMigrations,0);
  const cfg=JSON.parse(readFileSync(join(output,'workers/default/worker.config.json')));
  assert.equal(cfg.limits.subrequests,350);assert.equal(cfg.env.VINEXT_KV_CACHE.id,m.runtime.kv);
  const f=join(output,'workers/default/bundle/index.js');writeFileSync(f,readFileSync(f,'utf8')+'\n// mutation');
  assert.notEqual(fingerprint(output).digest,m.bundleDigest);
 }finally{rmSync(output,{recursive:true,force:true});}
});
test('stability preparation rejects upload arguments without changing release state',()=>{
 for(const args of [[],['--deploy'],['--prepare-only','--deploy']]){
  const p=spawnSync(process.execPath,[resolve('scripts/prepare-r1-stability-release.mjs'),...args],{encoding:'utf8'});
  assert.notEqual(p.status,0);assert.match(p.stderr,/uploading requires separate approval/);
 }
});
