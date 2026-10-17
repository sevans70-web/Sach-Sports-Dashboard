import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('NFL keeps withdrawn pregame board entries in history and can reactivate them before kickoff',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-nfl-history-')),previous=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const api=await loadTs(new URL('../lib/nfl-history.ts',import.meta.url)),time=new Date(Date.now()+3600000).toISOString(),schedule=[{id:'a',date:time,state:'pre',awayTeam:'A',homeTeam:'B'}];
  const row={playerId:'1',playerName:'First',gameId:'a',gameTime:time,matchup:'A @ B',sportsbookLine:200,modelProjection:210,rank:1},other={...row,playerId:'2',playerName:'Other'};
  await api.saveNflPregamePredictions('passing_yards',[row,other],schedule);
  await api.saveNflPregamePredictions('passing_yards',[row],schedule);
  let records=(await api.getNflPredictions('passing_yards',api.nflDay(time))).predictions;assert.equal(records.length,2);assert.equal(records.find(p=>p.playerId==='2').status,'void');
  await api.saveNflPregamePredictions('passing_yards',[row,other],schedule);
  records=(await api.getNflPredictions('passing_yards',api.nflDay(time))).predictions;assert.equal(records.length,2);assert.equal(records.find(p=>p.playerId==='2').status,'pending');
 }finally{if(previous===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previous;await rm(root,{recursive:true,force:true})}
});
