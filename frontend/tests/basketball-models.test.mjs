import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {basketballModelObservations}=await loadTs(new URL('../lib/basketball-model-observations.ts',import.meta.url));
const {basketballFeatureIndex}=await loadTs(new URL('../lib/basketball-model-inputs.ts',import.meta.url));
const identity={sport:'nba',season:'2025',gameId:'g',source:'official',retrievedAt:'2026-10-19T00:00:00Z'};
function fixture(id='g',date='2025-01-01T00:00:00Z'){
 const labels=['MIN','PTS','FG','3PT','FT','REB','AST','TO','STL','BLK','OREB'];
 return {header:{id,season:{year:2025,type:2},competitions:[{date,status:{type:{completed:true}},competitors:[{team:{id:'A'},homeAway:'home',score:'50'},{team:{id:'B'},homeAway:'away',score:'50'}]}]},boxscore:{players:['A','B'].map(team=>({team:{id:team},statistics:[{labels,totals:['','50','20-40','5-10','5-10','25','10','5','5','5','5'],athletes:[...Array.from({length:5},(_,i)=>({athlete:{id:team+i,displayName:team+i},starter:true,didNotPlay:false,stats:['48','10','4-8','1-2','1-2','5','2','1','1','1','1']})),{athlete:{id:team+'dnp',displayName:'DNP'},starter:false,didNotPlay:true,stats:[]}]}]}))}};
}
test('completed fixture observations reconcile minutes, usage and all team market totals; explicit DNPs remain outcomes',()=>{
 const rows=basketballModelObservations(fixture(),identity);assert.equal(rows.length,72);
 const p=rows.find(r=>r.playerId==='A0'&&r.market==='points');assert.equal(p.workload,48);assert.equal(p.actual,10);assert.ok(p.basketballContext.usage>0);
 assert.equal(rows.find(r=>r.playerId==='Adnp').workload,0);assert.equal(rows.find(r=>r.playerId==='Adnp').actual,0);
 const altered=fixture();altered.boxscore.players[0].statistics[0].athletes[0].stats[6]='3';assert.deepEqual(basketballModelObservations(altered,identity),[]);
});
test('wrong fixtures, preseason, unfinished or incomplete boxes cannot enter model fitting',()=>{
 for(const mutate of [p=>p.header.id='other',p=>p.header.season.type=1,p=>p.header.competitions[0].status.type.completed=false,p=>p.boxscore.players[0].statistics[0].athletes[0].stats.splice(0,1),p=>p.boxscore.players[1].team.id='other']){
  const p=fixture();mutate(p);assert.deepEqual(basketballModelObservations(p,identity),[]);
 }
});
const history=Array.from({length:12},(_,i)=>basketballModelObservations(fixture('g'+i,new Date(Date.UTC(2025,0,1+i*3)).toISOString()),{...identity,gameId:'g'+i})).flat();
const target={...history.find(r=>r.playerId==='A0'&&r.market==='points'),gameId:'target',gameTime:'2025-03-01T00:00:00Z'};
test('minutes/usage/opponent features use only earlier official games; target realized roles and outcomes do not leak',()=>{
 const expected=basketballFeatureIndex(history)(target);assert.equal(expected.features.length,24);
 const changed={...target,actual:999,workload:1,basketballContext:{...target.basketballContext,starter:false,usage:1,fieldGoalAttempts:999,teamPossessions:999,allowed:{points:999}}};
 assert.deepEqual(basketballFeatureIndex([...history,changed])(changed),expected);
 assert.deepEqual(basketballFeatureIndex([...history,{...changed,gameId:'future',gameTime:'2025-04-01T00:00:00Z'}])(target),expected);
 assert.notDeepEqual(basketballFeatureIndex(history)({...target,basketballContext:{...target.basketballContext,home:false}}).features,expected.features);
});
test('opening-season history can carry on the same team; transfers and absent opponents abstain',()=>{
 assert.ok(basketballFeatureIndex(history)({...target,season:'2026',gameTime:'2026-01-01T00:00:00Z'}).features);
 assert.equal(basketballFeatureIndex(history)({...target,teamId:'new'}).features,null);
 assert.equal(basketballFeatureIndex(history)({...target,opponentId:'unknown'}).reason,'insufficient_opponent_team_history');
});
