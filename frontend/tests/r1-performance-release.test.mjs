import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {preparePerformanceRelease,performanceRelease} from '../scripts/prepare-r1-performance-release.mjs';
import {fingerprint} from '../scripts/prepare-dashboard-retry-release.mjs';
test('updated performance artifact restores exactly and cannot reuse conditional approval for the old artifact',()=>{
 const output=mkdtempSync(join(tmpdir(),'r1-performance-freeze-'));
 try{
  const m=JSON.parse(readFileSync(join(performanceRelease,'manifest.json'))),result=preparePerformanceRelease(output);
  assert.equal(result.digest,m.bundleDigest);assert.equal(result.files,m.files);
  assert.equal(m.previousAuthorizationApplies,false);assert.equal(m.productionDeployed,false);
  assert.equal(m.approvalRequired,true);assert.equal(m.fallbackVersion,'a48c431a-5c3e-4491-8529-38cb20dfa898');
  for(const f of JSON.parse(readFileSync(join(performanceRelease,'files.json')))){
   const b=readFileSync(join(output,f.path));assert.equal(b.length,f.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),f.sha256);
  }
  const path=join(output,'workers/default/bundle/index.js');writeFileSync(path,readFileSync(path,'utf8')+'\n// tampered');
  assert.notEqual(fingerprint(output).digest,m.bundleDigest);
 }finally{rmSync(output,{recursive:true,force:true});}
});
test('updated performance preparation rejects deployment flags',()=>{
 const result=spawnSync(process.execPath,[resolve('scripts/prepare-r1-performance-release.mjs'),'--deploy'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/requires separate approval/);
});
