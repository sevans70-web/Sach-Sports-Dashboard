import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {prepareFinalR1,finalR1Release} from '../scripts/prepare-r1-final-release.mjs';
import {fingerprint} from '../scripts/prepare-dashboard-retry-release.mjs';

test('final R1 restores the tested artifact, keeps the existing namespace, and detects tampering',()=>{
 const output=mkdtempSync(join(tmpdir(),'r1-final-frozen-'));
 try{
  const m=JSON.parse(readFileSync(join(finalR1Release,'manifest.json')));
  assert.equal(m.sourceCommit,'78ed0d5f43e6fa143124d3086792c218a6b6bc04');
  assert.ok(m.includedVerifiedCommits.includes('58829c2'));
  assert.ok(m.includedVerifiedCommits.includes('d605e1a'));
  assert.equal(m.runtime.newNamespaces,0);
  assert.equal(m.runtime.newMigrations,0);
  assert.equal(m.protectedBackupRecords,20468);
  const result=prepareFinalR1(output);
  assert.equal(result.digest,m.bundleDigest);
  assert.equal(result.files,m.files);
  assert.equal(result.productionDeployed,false);
  assert.equal(result.approvalRequired,true);
  assert.equal(createHash('sha256').update(readFileSync(join(finalR1Release,'files.json'))).digest('hex'),m.allFileChecksumsSha256);
  const files=JSON.parse(readFileSync(join(finalR1Release,'files.json')));
  for(const f of files){const bytes=readFileSync(join(output,f.path));assert.equal(bytes.length,f.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);}
  const path=join(output,'workers/default/bundle/index.js');
  writeFileSync(path,readFileSync(path,'utf8')+'\n// mutation must fail fingerprint verification');
  assert.notEqual(fingerprint(output).digest,m.bundleDigest);
 }finally{rmSync(output,{recursive:true,force:true});}
});

test('final R1 preparation rejects upload flags before doing any work',()=>{
 for(const flags of [['--deploy'],['--dry-run','--deploy'],[]]){
  const result=spawnSync(process.execPath,[resolve('scripts/prepare-r1-final-release.mjs'),...flags],{encoding:'utf8'});
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/uploading requires separate approval/);
 }
});
