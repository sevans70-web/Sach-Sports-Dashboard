import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {WORKLOAD_FEATURES,observationProblem,candidateForecast,walkForwardBacktest}=await loadTs(new URL('../lib/workload-forecast.ts',import.meta.url));
function row(i,sport='nfl',market='passing_yards'){
 const kickoff=new Date(Date.UTC(2026,0,i+1)).toISOString();return {id:String(i),playerId:'1',sport,market,period:'game',roleId:'starter',season:'2026',kickoff,featuresAt:new Date(Date.parse(kickoff)-3600000).toISOString(),finalAt:new Date(Date.parse(kickoff)+14400000).toISOString(),features:Object.fromEntries(WORKLOAD_FEATURES[sport].map(k=>[k,k==='goalieConfirmed'?1:10+i%5])),actual:100+i%5,line:99.5,quoteAt:new Date(Date.parse(kickoff)-3660000).toISOString(),overPrice:-110,underPrice:-110};
}
test('every active sport requires its own pregame context; Q1 cannot inherit full-game workload',()=>{
 for(const sport of Object.keys(WORKLOAD_FEATURES)){const r=row(1,sport,'points');assert.equal(observationProblem(r),null);delete r.features[WORKLOAD_FEATURES[sport][0]];assert.equal(observationProblem(r),'missing_context')}
 const q=row(1);q.market='q1_passing_yards';q.period='q1';assert.equal(observationProblem(q),'quarter_workload_required');q.features.periodSpecific=1;assert.equal(observationProblem(q),null);
});
test('new roles, first scorers, incomplete context and unavailable goalies abstain',()=>{
 const history=Array.from({length:110},(_,i)=>row(i));const r=row(120);r.roleId='new-starter';assert.equal(candidateForecast(history,r).reason,'insufficient_current_role');
 r.market='first_td';assert.equal(candidateForecast(history,r).reason,'scorer_model_required');
 const h=row(1,'nhl','shots');h.features.goalieConfirmed=0;assert.equal(observationProblem(h),'unconfirmed_goalie');
});
test('future results, concurrent results and target outcome never affect a pregame forecast',()=>{
 const history=Array.from({length:110},(_,i)=>row(i)),target=row(120),a=candidateForecast(history,target);
 assert.ok(a.projection>0);const future=row(130);future.actual=99999;
 assert.deepEqual(candidateForecast([...history,future],{...target,actual:999999}),a);
 const late=history.map(r=>({...r,finalAt:target.kickoff}));assert.equal(candidateForecast(late,target).projection,null);
});
test('walk-forward reports coverage and grouped errors without promoting a model; duplicate records rejected',()=>{
 const rows=Array.from({length:110},(_,i)=>row(i));const r=walkForwardBacktest(rows);assert.equal(r.validated,false);assert.ok(r.forecasts>0);assert.ok(r.coverage<1);assert.equal(r.groups.length,1);assert.ok(r.groups[0].mae>=0);assert.throws(()=>walkForwardBacktest([rows[0],rows[0]]),/Duplicate/);
});
