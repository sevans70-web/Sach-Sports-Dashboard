import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadTs} from './load-ts.mjs';
const {extractAppearances,hasSoccerMetric}=await loadTs(new URL('../lib/soccer-history.ts',import.meta.url));
const {soccerPick,soccerSettlement,mergeSoccerPicks,soccerDay}=await loadTs(new URL('../lib/soccer-settlement.ts',import.meta.url));
const now=new Date('2026-10-16T20:00:00Z');
const row={playerId:'159443',playerName:'Test Keeper',games:5,gameId:'123',kickoff:'2026-10-16T21:00:00Z',marketLine:3.5,projection:4.2,modelProbability:65,sportsbook:'Book',rank:1};
test('named ESPN roster stats retain real production and genuine zeroes, not missing fields',()=>{
 const payload={rosters:[{team:{id:'1',displayName:'Club'},roster:[{athlete:{id:'159443',displayName:'Test Keeper'},position:{name:'Goalkeeper'},starter:true,stats:[{name:'appearances',value:1},{name:'saves',value:4},{name:'totalGoals',value:0},{name:'goalAssists',value:1},{name:'totalShots',value:0}]}]}]};
 const [p]=extractAppearances(payload,{gameId:'123',gameDate:now.toISOString()});
 assert.equal(p.saves,4);assert.equal(p.goals,0);assert.equal(p.assists,1);assert.equal(p.position,'GK');
 assert.equal(hasSoccerMetric(p,'saves'),true);assert.equal(hasSoccerMetric(p,'goals'),true);
 assert.equal(hasSoccerMetric(p,'shots_on_target'),false);assert.equal(hasSoccerMetric(p,'minutes'),false);
});
test('unused substitutes do not become zero-stat historical appearances',()=>{
 const p={rosters:[{team:{id:'1'},roster:[{athlete:{id:'2',displayName:'Unused'},stats:[{name:'appearances',value:0},{name:'totalShots',value:0}]}]}]};
 assert.deepEqual(extractAppearances(p,{gameId:'1',gameDate:now.toISOString()}),[]);
});
test('only verified pregame props with usable history become saved picks',()=>{
 assert.equal(soccerPick('eng.1','saves',row,now).pickSide,'OVER');
 for(const changed of [{marketLine:null},{projection:null},{games:0},{sportsbook:''},{earlyModel:true},{playerId:'model:unknown'},{kickoff:'2026-10-16T19:00:00Z'}])assert.equal(soccerPick('eng.1','saves',{...row,...changed},now),null);
 assert.equal(soccerPick('eng.1','saves',{...row,projection:2},now).pickSide,'UNDER');
});
test('kickoff locks, settled results and unrelated history survive refreshes',()=>{
 const old=soccerPick('eng.1','saves',row,now),next={...old,sportsbookLine:8.5,modelProjection:10};
 assert.equal(mergeSoccerPicks([old],[next],new Date('2026-10-16T21:01:00Z'))[0].sportsbookLine,3.5);
 assert.equal(mergeSoccerPicks([{...old,status:'hit',actual:5}],[next],now)[0].status,'hit');
 const other={...old,key:'other'};assert.equal(mergeSoccerPicks([old,other],[next],now).length,2);
 assert.equal(mergeSoccerPicks([],[old],new Date('2026-10-16T21:01:00Z')).length,0);
});
test('soccer settlement handles both sides, pushes, missing stats and actual zero',()=>{
 assert.equal(soccerSettlement({sportsbookLine:3.5,pickSide:'OVER'},4),'hit');
 assert.equal(soccerSettlement({sportsbookLine:3.5,pickSide:'UNDER'},4),'miss');
 assert.equal(soccerSettlement({sportsbookLine:3,pickSide:'UNDER'},3),'push');
 assert.equal(soccerSettlement({sportsbookLine:.5,pickSide:'UNDER'},0),'hit');
 assert.equal(soccerSettlement({sportsbookLine:.5,pickSide:'OVER'},null),'pending');
});
test('durable capture can be read and graded without losing another prediction',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-soccer-test-'));const previous=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const api=await loadTs(new URL('../lib/soccer-predictions.ts',import.meta.url));
  const clock=new Date(Date.now()-2*3600000),kickoff=new Date(Date.now()-3600000).toISOString();
  const a={...row,kickoff},b={...a,playerId:'222',playerName:'Other'};
  const result=await api.captureSoccerPredictions('eng.1',{saves:[a,b]},clock);assert.equal(result.verifiedPredictions,2);assert.equal(result.writable,true);
  let picks=await api.readSoccerPredictions('Season','saves','eng.1');assert.equal(picks.length,2);assert.equal(picks[0].gameDate,soccerDay(kickoff));
  assert.equal(await api.saveSoccerGrades([{...picks[0],status:'hit',actual:4,gradedAt:new Date().toISOString()}]),true);
  picks=await api.readSoccerPredictions('Season','saves','eng.1');assert.equal(picks.length,2);assert.equal(picks.filter(p=>p.status==='hit').length,1);assert.equal(picks.filter(p=>p.status==='pending').length,1);
 }finally{if(previous===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=previous;await rm(root,{recursive:true,force:true})}
});
