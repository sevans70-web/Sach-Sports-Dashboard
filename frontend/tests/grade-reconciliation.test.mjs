import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {reconcileOfficialGrade,correctedGrade}=await loadTs(new URL('../lib/grade-reconciliation.ts',import.meta.url));
const {mergePredictionHistory}=await loadTs(new URL('../lib/prediction-history-write.ts',import.meta.url));
const row={key:'fixture|player|yards',gameId:'123',playerId:'42',playerName:'Same Name',market:'passing_yards',pickSide:'UNDER',sportsbookLine:100.5,actual:100,status:'hit',gradedAt:'2026-10-18T18:00:00Z',modelProjection:90};
const football=(actual=101,id='42')=>({header:{id:'123',competitions:[{status:{type:{completed:true}}}]},boxscore:{players:[{statistics:[{name:'passing',labels:['YDS'],athletes:[{athlete:{id,displayName:'Same Name'},stats:[String(actual)]}]}]}]}});
test('NFL and CFB official corrections flip an incorrect hit and preserve the original result',()=>{
 for(const sport of ['nfl','cfb']){
  const corrected=reconcileOfficialGrade(row,football(),sport);
  assert.equal(corrected.status,'miss');assert.equal(corrected.actual,101);
  assert.equal(corrected.gradeRevisions[0].previousStatus,'hit');assert.equal(corrected.gradeRevisions[0].previousActual,100);
  assert.equal(reconcileOfficialGrade(corrected,football(),sport),corrected);
  const saved=mergePredictionHistory([row],[{...corrected,modelProjection:999}])[0];
  assert.equal(saved.status,'miss');assert.equal(saved.modelProjection,90);
  assert.deepEqual(mergePredictionHistory([saved],[row]),[saved]);
 }
});
test('exact fixture, exact player, final status and explicit saved side are required',()=>{
 assert.equal(reconcileOfficialGrade(row,football(101,'99'),'nfl'),row);
 assert.equal(reconcileOfficialGrade({...row,gameId:'456'},football(),'nfl').actual,100);
 const live=football();live.header.competitions[0].status.type.completed=false;
 assert.equal(reconcileOfficialGrade(row,live,'nfl'),row);
 assert.equal(reconcileOfficialGrade({...row,pickSide:undefined},football(),'nfl').actual,100);
 assert.equal(reconcileOfficialGrade({...row,market:'q1_passing_yards'},football(),'nfl').actual,100);
 const partial=football();partial.boxscore.players=[];
 assert.equal(reconcileOfficialGrade(row,partial,'nfl'),row);
 assert.equal(correctedGrade(row,{...row,status:'miss',actual:101}),null);
});
test('basketball corrections use the saved side across NBA, WNBA and CBB',()=>{
 const payload=football();payload.boxscore.players[0].statistics[0].labels=['PTS'];
 for(const sport of ['nba','wnba','cbb']){
  const result=reconcileOfficialGrade({...row,market:'points'},payload,sport);
  assert.equal(result.status,'miss');assert.equal(result.actual,101);
 }
});
test('NHL corrections require the exact final NHL fixture',()=>{
 const payload={id:123,gameState:'OFF',playerByGameStats:{homeTeam:{forwards:[{playerId:42,goals:2,toi:'20:00'}],defense:[],goalies:[]},awayTeam:{forwards:[],defense:[],goalies:[]}}};
 const original={...row,market:'goals',actual:0,sportsbookLine:.5,pickSide:'OVER',status:'miss'};
 const result=reconcileOfficialGrade(original,payload,'nhl');
 assert.equal(result.actual,2);assert.equal(result.status,'hit');
 payload.id=999;assert.equal(reconcileOfficialGrade(original,payload,'nhl'),original);
});
