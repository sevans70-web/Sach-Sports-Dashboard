import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
const api=await loadTs(new URL('../lib/prediction-history-write.ts',import.meta.url));
test('a stale capture cannot erase a settled result or original locked projection',()=>{
 const old={key:'a',status:'hit',actual:12,modelProjection:11,savedAt:'2026-10-17T12:00:00Z',frozenAt:'2026-10-17T13:00:00Z'};
 assert.deepEqual(api.mergePredictionHistory([old],[{...old,status:'pending',actual:null,modelProjection:99}]),[old]);
 assert.equal(api.mergePredictionHistory([{...old,status:'pending',actual:null}],[{...old,status:'hit',modelProjection:99}])[0].modelProjection,11);
});
test('concurrent capture and grading writes preserve all records and final grades on disk',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-write-test-')),previous=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const a={key:'a',status:'pending',savedAt:'2026-10-17T12:00:00Z'},b={...a,key:'b'};
  let last=[];await api.writePredictionHistory('nba','points','2026-10-17',[a],r=>last=r);
  await Promise.all([api.writePredictionHistory('nba','points','2026-10-17',[{...a,status:'hit',actual:10}],r=>last=r),api.writePredictionHistory('nba','points','2026-10-17',[a,b],r=>last=r)]);
  assert.equal(last.length,2);assert.equal(last.find(p=>p.key==='a').status,'hit');
 }finally{if(previous===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previous;await rm(root,{recursive:true,force:true})}
});
