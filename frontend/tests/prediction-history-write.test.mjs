import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
const suiteRoot=await mkdtemp(path.join(os.tmpdir(),'sach-history-suite-')),previousRoot=process.env.SACH_HISTORY_DIR;
process.env.SACH_HISTORY_DIR=suiteRoot;
test.after(async()=>{if(previousRoot===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previousRoot;await rm(suiteRoot,{recursive:true,force:true})});
const api=await loadTs(new URL('../lib/prediction-history-write.ts',import.meta.url));
const {reconcileOfficialGrade}=await loadTs(new URL('../lib/grade-reconciliation.ts',import.meta.url));
test('official corrections survive durable writes and stale settled snapshots',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-correction-test-')),previous=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const old={key:'a',gameId:'123',playerId:'42',market:'points',sportsbookLine:10.5,pickSide:'UNDER',status:'hit',actual:10,modelProjection:9};
  const payload={header:{id:'123',competitions:[{status:{type:{completed:true}}}]},boxscore:{players:[{statistics:[{labels:['PTS'],athletes:[{athlete:{id:'42'},stats:['12']}]}]}]}};
  const correction=reconcileOfficialGrade(old,payload,'nba');let last=[];
  await api.writePredictionHistory('nba','points','2026-10-16',[old],r=>last=r);
  await api.writePredictionHistory('nba','points','2026-10-16',[correction],r=>last=r);
  await api.writePredictionHistory('nba','points','2026-10-16',[old],r=>last=r);
  assert.equal(last[0].status,'miss');assert.equal(last[0].actual,12);assert.equal(last[0].gradeRevisions[0].previousActual,10);
 }finally{if(previous===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previous;await rm(root,{recursive:true,force:true})}
});
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
