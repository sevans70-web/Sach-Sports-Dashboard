import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('NHL rejected research capture and later grading preserve unrelated original history',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-nhl-lock-')),old=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const api=await loadTs(new URL('../lib/nhl-history.ts',import.meta.url)),time=new Date(Date.now()-3600000).toISOString(),day=api.nhlDay(time);
  const original={key:'old',playerId:'1',playerName:'Original',gameDate:day,gameId:'a',gameTime:time,matchup:'A @ B',market:'shots_on_goal',sportsbookLine:1.5,modelProjection:2,pickSide:'OVER',savedAt:time,status:'pending',actual:null};
  const later={...original,key:'other',playerId:'2',gameId:'b',status:'hit',actual:3};
  await api.saveNhlGrades('shots_on_goal',day,[original,later]);
  assert.equal((await api.saveNhlSlate('shots_on_goal',[{...original,sportsbookLine:8.5,prediction:'UNDER'}],true)).ok,false);
  let records=(await api.getNhlPredictions('shots_on_goal',day)).predictions;assert.deepEqual(records,[original,later]);
  await api.saveNhlGrades('shots_on_goal',day,[{...original,status:'hit',actual:2}]);
  records=(await api.getNhlPredictions('shots_on_goal',day)).predictions;assert.equal(records.length,2);assert.equal(records[0].sportsbookLine,1.5);assert.equal(records[1].actual,3);
 }finally{if(old===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=old;await rm(root,{recursive:true,force:true})}
});
