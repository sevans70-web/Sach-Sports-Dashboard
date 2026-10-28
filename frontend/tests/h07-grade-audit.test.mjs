import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {reviewPerformanceGrade}=await loadTs(new URL('../lib/performance-grade-review.ts',import.meta.url));
const {rawFinalPerformance}=await loadTs(new URL('../lib/raw-final-performance.ts',import.meta.url));
test('all eight sports preserve incomplete legacy grades without counting them as verified decisions',()=>{
 for(const sport of ['nfl','cfb','nba','wnba','nhl','cbb','soccer','mlb']){
  const r={sport,status:'hit',market:'points',actual:2,sportsbookLine:1,pickSide:null,modelProjection:3};
  const next=reviewPerformanceGrade(r);assert.equal(next.status,'unknown');assert.equal(next.legacyResult,'hit');assert.equal(r.status,'hit');assert.equal(next.pickSide,null);
  assert.equal(reviewPerformanceGrade({...r,pickSide:'OVER'}).status,'hit');
  assert.equal(reviewPerformanceGrade({...r,pickSide:'OVER',actual:null}).status,'unknown');
 }
});
const feed={gamePk:7,gameData:{status:{abstractGameState:'Final'}},liveData:{boxscore:{teams:{home:{players:{ID9:{person:{id:9},stats:{batting:{plateAppearances:1,hits:0,runs:0,rbi:0},pitching:{battersFaced:4,inningsPitched:'1.2',strikeOuts:0}}},ID10:{person:{id:10},stats:{batting:{hits:0}}}}},away:{players:{}}}}}};
test('MLB finals require exact fixture and participation; retain zero and convert baseball innings to outs',()=>{
 const p=rawFinalPerformance('mlb','7',feed);assert.equal(p.rows.length,1);assert.equal(p.rows[0].stats.hits,0);assert.equal(p.rows[0].stats.hits_runs_rbis,0);assert.equal(p.rows[0].stats.outs_recorded,5);assert.equal(p.rows[0].stats.total_bases,undefined);
 assert.equal(rawFinalPerformance('mlb','8',feed),null);assert.equal(rawFinalPerformance('mlb','7',{...feed,gameData:{status:{abstractGameState:'Live'}}}),null);
});
test('soccer missing, live, or mismatched official evidence never fabricates a final',()=>{
 for(const p of [{},{header:{id:'8',status:{type:{completed:true}}}},{header:{id:'7',status:{type:{state:'in'}}}},{header:{id:'7',status:{type:{completed:true}}},rosters:[]}])assert.equal(rawFinalPerformance('soccer','7',p),null);
});

test('soccer explicit appearance and explicit zero settle; omitted metrics and unused roster players stay unknown',()=>{
 const raw={header:{id:'7',competitions:[{status:{type:{completed:true}}}]},rosters:[{roster:[{athlete:{id:'9',displayName:'Player'},stats:[{name:'appearances',value:1},{name:'totalGoals',value:0},{name:'totalShots',value:2}]},{athlete:{id:'10',displayName:'Unused'},stats:[{name:'appearances',value:0},{name:'totalGoals',value:0}]}]}]};
 const p=rawFinalPerformance('soccer','7',raw);assert.equal(p.rows.length,1);assert.equal(p.rows[0].playerId,'9');assert.equal(p.rows[0].stats.goals,0);assert.equal(p.rows[0].stats.shots,2);assert.equal(p.rows[0].stats.saves,undefined);
});

test('soccer final identity uses player IDs even when teammates have identical names',()=>{
 const raw={header:{id:'7',status:{type:{completed:true}}},rosters:[{team:{id:'t'},roster:[9,10].map(id=>({athlete:{id:String(id),displayName:'Same Name'},stats:[{name:'appearances',value:1},{name:'totalGoals',value:id===9?0:1}]}))}]};
 const p=rawFinalPerformance('soccer','7',raw);assert.equal(p.rows.length,2);assert.equal(p.rows.find(r=>r.playerId==='9').stats.goals,0);assert.equal(p.rows.find(r=>r.playerId==='10').stats.goals,1);
});
