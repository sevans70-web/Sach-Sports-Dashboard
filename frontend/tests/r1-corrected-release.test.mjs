import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {spawnSync} from 'node:child_process';
import {prepareCorrectedR1,correctedRelease} from '../scripts/prepare-r1-corrected-release.mjs';
import {fingerprint} from '../scripts/prepare-dashboard-retry-release.mjs';
test('corrected R1 frozen bytes equal the already-tested output and preserve all release bindings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r1-corrected-freeze-'));
 try{
  const m=JSON.parse(readFileSync(join(correctedRelease,'manifest.json'))),tested=JSON.parse(readFileSync(resolve('../docs/audits/2026-11-17-r1-nba-recovery/verified-output.json')));
  const actual=prepareCorrectedR1(dir);assert.equal(actual.digest,tested.compiled.digest);assert.equal(actual.digest,m.bundleDigest);assert.equal(actual.files,424);assert.equal(actual.sourceCommit,m.sourceCommit);
  assert.equal(actual.productionDeployed,false);assert.equal(actual.approvalRequired,true);
  const path=join(dir,'workers/default/worker.config.json'),config=JSON.parse(readFileSync(path));config.env.VINEXT_KV_CACHE.id='different';writeFileSync(path,JSON.stringify(config));assert.throws(()=>fingerprint(dir),/configuration_mismatch/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('corrected release preparation has no upload mode',()=>{
 for(const args of [[],['--deploy'],['--dry-run','--deploy']]){
  const r=spawnSync(process.execPath,[resolve('scripts/prepare-r1-corrected-release.mjs'),...args],{encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/uploading requires separate approval/);
 }
});
