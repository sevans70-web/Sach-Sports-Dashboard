import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {nflPredictionProbability}=await loadTs(new URL('../lib/nfl-prediction.ts',import.meta.url));
const {cfbPredictionProbability}=await loadTs(new URL('../lib/cfb-prediction.ts',import.meta.url));
test('touchdown-count projections are not mistaken for percentages or first-scorer probabilities',()=>{
 for(const probability of [nflPredictionProbability,cfbPredictionProbability]){
  const half=probability('anytime_td',.5,.5,50),one=probability('anytime_td',1,.5,50);
  assert.ok(half>30&&half<60);assert.ok(one>half&&one<90);
  assert.equal(probability('first_td',1,.5,50),null);
 }
});
test('CFB confidence describes the selected under or over pick consistently',()=>{
 const under=cfbPredictionProbability('passing_yards',150,250,50),over=cfbPredictionProbability('passing_yards',350,250,50);
 assert.ok(under>50);assert.equal(under,over);
});
