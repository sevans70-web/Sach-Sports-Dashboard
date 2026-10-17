import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadTs} from './load-ts.mjs';
test('sport history writers retain late first captures as void and keep genuine pregame values locked',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-pregame-test-')),previous=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  for(const [sport,title]of [['nba','Nba'],['wnba','Wnba'],['cbb','Cbb']]){
   const api=await loadTs(new URL(`../lib/${sport}-history.ts`,import.meta.url));
   const now=new Date().toISOString(),late={playerId:'1',playerName:'Late',gameTime:now,gameState:'in',gameId:'a',matchup:'A @ B',sportsbookLine:10.5,modelProjection:12,prediction:'OVER',rank:1};
   await api[`save${title}Predictions`]('points',[late]);
   let records=await api[`get${title}Predictions`]('points',api[`${sport}Day`](now));
   assert.equal(records.predictions.find(p=>p.playerId==='1').status,'void',sport);
   const time=new Date(Date.now()+3600000).toISOString(),pregame={...late,playerId:'2',playerName:'Pregame',gameId:'b',gameTime:time,gameState:'pre'};
   await api[`save${title}Predictions`]('points',[pregame]);
   await api[`save${title}Predictions`]('points',[{...pregame,gameState:'in',sportsbookLine:99.5,modelProjection:100}]);
   records=await api[`get${title}Predictions`]('points',api[`${sport}Day`](time));
   const locked=records.predictions.find(p=>p.playerId==='2');assert.equal(locked.sportsbookLine,10.5,sport);assert.equal(locked.modelProjection,12,sport);assert.equal(locked.status,'pending',sport);
  }
  const now=new Date().toISOString();
  const nhl=await loadTs(new URL('../lib/nhl-history.ts',import.meta.url));
  await nhl.saveNhlSlate('shots_on_goal',[{playerId:'33',playerName:'Late Hockey',gameId:'c',gameTime:now,gameState:'in',matchup:'C @ D',sportsbookLine:2.5,modelProjection:3,prediction:'OVER'}],true);
  assert.equal((await nhl.getNhlPredictions('shots_on_goal',nhl.nhlDay(now))).predictions[0].status,'void');
  const cfb=await loadTs(new URL('../lib/cfb-history.ts',import.meta.url));
  await cfb.saveCfbPregamePredictions('passing_yards',[{playerId:'44',playerName:'Late Football',matchup:'E @ F',gameTime:now,gameId:'d',sportsbookLine:250.5,modelProjection:270,modelProbability:65,marketBacked:true,rank:1}],[{id:'d',awayTeam:'E',homeTeam:'F',date:now,state:'in'}]);
  assert.equal(cfb.getRuntimeCfbPredictions('passing_yards',cfb.cfbDay(now)).predictions[0].status,'void');
 }finally{if(previous===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previous;await rm(root,{recursive:true,force:true})}
});
