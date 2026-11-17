import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareDurableR1,durableRelease} from '../scripts/prepare-r1-durable-release.mjs';
import {fingerprint} from '../scripts/prepare-dashboard-retry-release.mjs';

test('durable R1 extracts the exact frozen artifact and rejects changed code or bindings',()=>{
 const dir=mkdtempSync(join(tmpdir(),'r1-durable-freeze-'));
 try {
  const manifest=JSON.parse(readFileSync(join(durableRelease,'manifest.json')));
  const actual=prepareDurableR1(dir);
  assert.equal(actual.digest,manifest.bundleDigest);
  assert.equal(actual.files,manifest.files);
  assert.equal(actual.sourceCommit,manifest.sourceCommit);
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

test('durable R1 preparation has no upload mode',()=>{
 for(const flags of [['--deploy'],['--dry-run','--deploy'],[]]){
  const result=spawnSync(process.execPath,[resolve('scripts/prepare-r1-durable-release.mjs'),...flags],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/upload requires separate approval/);
 }
});
