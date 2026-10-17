import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('NHL locks each game separately, admits later pregame lines and retains unrelated history during grading',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-nhl-lock-')),old=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const api=await loadTs(new URL('../lib/nhl-history.ts',import.meta.url)),time=new Date(Date.now()+3600000).toISOString();
  const row={playerId:'1',playerName:'Early',gameId:'a',gameTime:time,gameState:'pre',matchup:'A @ B',sportsbookLine:1.5,modelProjection:2,prediction:'OVER',rank:1};
  const later={...row,playerId:'2',playerName:'Late',gameId:'b',matchup:'C @ D',sportsbookLine:null,prediction:null};
  await api.saveNhlSlate('shots_on_goal',[row,later],false);
  await api.saveNhlSlate('shots_on_goal',[{...row,gameState:'in',sportsbookLine:8.5},{...later,sportsbookLine:2.5,prediction:'OVER'}],true);
  let records=(await api.getNhlPredictions('shots_on_goal',api.nhlDay(time))).predictions;
  assert.equal(records.find(p=>p.playerId==='1').sportsbookLine,1.5);assert.equal(records.find(p=>p.playerId==='2').sportsbookLine,2.5);
  await api.saveNhlGrades('shots_on_goal',api.nhlDay(time),[{...records[0],status:'hit',actual:3,gradedAt:new Date().toISOString()}]);
  await api.saveNhlSlate('shots_on_goal',[{...later,sportsbookLine:3.5,prediction:'UNDER'}],false);
  records=(await api.getNhlPredictions('shots_on_goal',api.nhlDay(time))).predictions;
  assert.equal(records.length,2);assert.equal(records.find(p=>p.playerId==='1').status,'hit');
 }finally{if(old===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=old;await rm(root,{recursive:true,force:true})}
});
