import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {fitResearchCalibration:fit,researchCalibratedProbability:apply}=await loadTs(new URL('../lib/research-probability-calibration.ts',import.meta.url));
test('small samples abstain and invalid or future-unresolved labels cannot fit',()=>{
 assert.equal(fit(Array.from({length:29},()=>({p:.8,y:1}))),null);
 for(const row of [{p:NaN,y:1},{p:-1,y:0},{p:.5,y:null},{p:.5,y:2}])assert.throws(()=>fit([row]));
});
test('fixed calibration learns overconfidence from training only and remains bounded and monotone',()=>{
 const training=Array.from({length:100},(_,i)=>({p:.9,y:i%2})),before=structuredClone(training),m=fit(training);
 assert.ok(Math.abs(apply(m,.9)-.5)<.03);assert.deepEqual(training,before);
 const values=[0,.01,.1,.5,.9,.99,1].map(p=>apply(m,p));assert.ok(values.every(p=>Number.isFinite(p)&&p>0&&p<1));assert.deepEqual([...values].sort((a,b)=>a-b),values);
 assert.deepEqual(fit(training),m);assert.throws(()=>apply({...m,slope:-1},.5));
});
