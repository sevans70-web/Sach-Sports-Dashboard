import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('every active sport refuses unvalidated new picks, even with a valid quote or spoofed validation flag',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-integrity-capture-')),previous=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const now=new Date().toISOString(),time=new Date(Date.now()+3600000).toISOString();
  const row={playerId:'1',playerName:'Research',gameId:'a',matchup:'A @ B',gameTime:time,gameState:'pre',sportsbookLine:10.5,modelProjection:12,prediction:'OVER',rank:1,quoteVersion:1,sportsbook:'FanDuel',sportsbookKey:'fanduel',lineType:'main',overPrice:-110,underPrice:-110,quoteUpdatedAt:now,forecastModelId:'fake',forecastValidation:{passed:true}};
  for(const [sport,title]of [['nba','Nba'],['wnba','Wnba'],['cbb','Cbb']]){
   const api=await loadTs(new URL('../lib/'+sport+'-history.ts',import.meta.url));
   assert.equal(await api['save'+title+'Predictions']('points',[row]),false);
   const records=await api['get'+title+'Predictions']('points',api[sport+'Day'](time));assert.equal(records.predictions.length,0,sport);
  }
  const nhl=await loadTs(new URL('../lib/nhl-history.ts',import.meta.url));assert.equal((await nhl.saveNhlSlate('shots_on_goal',[row],false)).ok,false);
  const cfb=await loadTs(new URL('../lib/cfb-history.ts',import.meta.url));assert.equal(await cfb.saveCfbPregamePredictions('passing_yards',[row],[]),false);
  const nfl=await loadTs(new URL('../lib/nfl-history.ts',import.meta.url));assert.equal(await nfl.saveNflPregamePredictions('passing_yards',[row],[]),false);
 }finally{if(previous===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previous;await rm(root,{recursive:true,force:true})}
});
test('rejected research captures do not overwrite original saved basketball values or grades',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-integrity-history-')),previous=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const time=new Date(Date.now()+3600000).toISOString();
  for(const [sport,title]of [['nba','Nba'],['wnba','Wnba'],['cbb','Cbb']]){
   const api=await loadTs(new URL('../lib/'+sport+'-history.ts',import.meta.url)),day=api[sport+'Day'](time);
   const original={key:'saved',playerId:'1',playerName:'Original',gameId:'a',gameDate:day,gameTime:time,matchup:'A @ B',market:'points',sportsbookLine:10.5,modelProjection:12,pickSide:'OVER',giScore:80,bookmakerCount:1,savedAt:new Date().toISOString(),status:'hit',actual:15,frozenAt:new Date().toISOString()};
   await api['save'+title+'Grades']('points',day,[original]);
   await api['save'+title+'Predictions']('points',[{...original,sportsbookLine:99.5,prediction:'UNDER'}]);
   const records=await api['get'+title+'Predictions']('points',day);assert.deepEqual(records.predictions,[original]);
  }
 }finally{if(previous===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previous;await rm(root,{recursive:true,force:true})}
});
