import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballQuarterRows:q}=await loadTs(new URL('../lib/football-quarter-stats.ts',import.meta.url));
const {reconcileOfficialGrade}=await loadTs(new URL('../lib/grade-reconciliation.ts',import.meta.url));
function fixture(){return {boxscore:{players:[{team:{id:'1',abbreviation:'A'},statistics:[
 {name:'passing',labels:['C/ATT','YDS'],athletes:[{athlete:{id:'10',displayName:'Alex Smith'},stats:['2/3','30']}]},
 {name:'receiving',labels:['REC','YDS'],athletes:[{athlete:{id:'11',displayName:'Ben Smith'},stats:['2','30']}]},
 {name:'rushing',labels:['CAR','YDS'],athletes:[{athlete:{id:'12',displayName:'Carl Jones'},stats:['1','-2']}]}]}]},plays:[
 {id:'0',period:{number:1},clock:{displayValue:'15:00'},type:{text:'Kickoff'},text:'Kickoff'},
 {id:'1',period:{number:1},start:{team:{id:'1'}},type:{text:'Pass Reception'},text:'A.Smith pass short right to B.Smith for 10 yards',statYardage:10},
 {id:'2',period:{number:1},start:{team:{id:'1'}},type:{text:'Pass Incompletion'},text:'A.Smith pass incomplete short left to B.Smith',statYardage:0},
 {id:'3',period:{number:1},start:{team:{id:'1'}},type:{text:'Rush'},text:'C.Jones left tackle for -2 yards',statYardage:-2},
 {id:'4',period:{number:2},start:{team:{id:'1'}},type:{text:'Pass Reception'},text:'A.Smith pass short right to B.Smith for 20 yards',statYardage:20}
 ]}}
test('Q1 yards identify passer and receiver separately, preserve negative rush yards and exclude later periods',()=>{
 const rows=q(fixture());assert.equal(rows.find(r=>r.playerId==='10').stats.q1_passing_yards,10);assert.equal(rows.find(r=>r.playerId==='11').stats.q1_receiving_yards,10);assert.equal(rows.find(r=>r.playerId==='12').stats.q1_rushing_yards,-2);
});
test('truncated tape, incomplete Q1 and mismatched attempt totals stay unknown',()=>{
 for(const mutate of [p=>p.plays.shift(),p=>p.plays.pop(),p=>p.plays.splice(2,1),p=>p.boxscore.players[0].statistics[0].athletes[0].stats[1]='31']){
 const p=fixture();mutate(p);assert.equal(q(p).find(r=>r.playerId==='10').stats.q1_passing_yards,null);
 }
});
test('ambiguous same-team initials cannot attribute passing yards to either athlete',()=>{
 const p=fixture();p.boxscore.players[0].statistics[0].athletes.push({athlete:{id:'13',displayName:'Adam Smith'},stats:['0/0','0']});
 assert.equal(q(p).find(r=>r.playerId==='10').stats.q1_passing_yards,null);
});
test('duplicate drive copies and nullified plays do not double-count Q1 results',()=>{
 const p=fixture();p.drives={previous:[{team:{id:'1'},plays:p.plays}]};p.plays.push({id:'99',period:{number:1},start:{team:{id:'1'}},type:{text:'Pass Reception'},text:'A.Smith pass to B.Smith for 40 yards. No Play.',statYardage:40});assert.equal(q(p).find(r=>r.playerId==='10').stats.q1_passing_yards,10);
});
test('a reconciled official quarter corrects an old grade while retaining its audit trail',()=>{
 const p=fixture();p.header={id:'100',competitions:[{status:{type:{completed:true}}}]};
 const original={key:'saved',gameId:'100',playerId:'10',market:'q1_passing_yards',pickSide:'OVER',sportsbookLine:11.5,status:'hit',actual:30};
 const result=reconcileOfficialGrade(original,p,'nfl');assert.equal(result.actual,10);assert.equal(result.status,'miss');assert.equal(result.gradeRevisions[0].previousActual,30);
 p.plays.shift();assert.equal(reconcileOfficialGrade(original,p,'nfl'),original);
});
