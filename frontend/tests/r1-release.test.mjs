import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareR1,r1Release} from '../scripts/prepare-r1-release.mjs';
import {fingerprint} from '../scripts/prepare-dashboard-retry-release.mjs';

test('R1 extracts its frozen production artifact and detects changed code or bindings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r1-freeze-'));
 try {
  const manifest=JSON.parse(readFileSync(join(r1Release,'manifest.json')));
  const actual=prepareR1(dir);
  assert.equal(actual.digest,manifest.bundleDigest);
  assert.equal(actual.files,424);
  assert.equal(actual.productionDeployed,false);
  assert.equal(actual.approvalRequired,true);
  const entry=join(dir,'workers/default/bundle/index.js');
  writeFileSync(entry,readFileSync(entry,'utf8')+'\n// altered rehearsal');
  assert.notEqual(fingerprint(dir).digest,manifest.bundleDigest);
  const config=join(dir,'workers/default/worker.config.json'),body=JSON.parse(readFileSync(config));
  body.name='sach-cw08-nhl-shadow';writeFileSync(config,JSON.stringify(body));
  assert.throws(()=>fingerprint(dir),/configuration_mismatch/);
 } finally {rmSync(dir,{recursive:true,force:true});}
});

test('R1 preparation cannot upload or accept deployment flags',()=>{
 for(const flags of [['--deploy'],['--dry-run','--deploy'],[]]){
  const result=spawnSync(process.execPath,[resolve('scripts/prepare-r1-release.mjs'),...flags],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/uploading requires separate approval/);
 }
});
