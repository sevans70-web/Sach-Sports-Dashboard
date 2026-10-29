import{test}from'node:test';import assert from'node:assert/strict';import{confidenceSummary}from'../scripts/p01-confidence-summary.mjs';
test('confidence audit scores UNDER confidence on its own side and excludes pushes, missing and tied calls',()=>{
 const row=(over,side,won,push=false)=>({push,candidate:{over,direction:side,directionWon:won}});
 const r=confidenceSummary([row(.1,'UNDER',false),row(.2,'UNDER',true),row(.9,'OVER',true),row(.99,'OVER',null,true),row(.5,null,null),row(null,'UNDER',false)],'candidate');
 assert.equal(r[0].count,3);assert.equal(r[0].hits,2);assert.equal(r[2].atLeast80.count,2);assert.equal(r[2].atLeast80.hits,1);assert.ok(Math.abs(r[2].atLeast80.meanConfidence-.85)<1e-12);assert.ok(Math.abs(r[2].atLeast80.overconfidenceGap-.35)<1e-12);assert.equal(r[0].bins.reduce((n,b)=>n+b.count,0),3);
});
test('empty confidence cohorts report unknown accuracy rather than zero',()=>{for(const r of confidenceSummary([],'baseline')){assert.equal(r.hitRate,null);assert.equal(r.overconfidenceGap,null);assert.equal(r.atLeast80.meanConfidence,null);}});
