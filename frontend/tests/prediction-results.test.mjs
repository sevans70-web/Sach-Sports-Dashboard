import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {matchingPredictionResult}=await loadTs(new URL('../lib/prediction-results.ts',import.meta.url));
const {statNumber}=await loadTs(new URL('../lib/provider-fetch.ts',import.meta.url));
test('a player result cannot leak onto another game, day, or market',()=>{
 const result={playerId:'1',gameId:'a',gameDate:'2026-10-16',market:'points',status:'hit'};
 const payload={results:[result]};
 assert.equal(matchingPredictionResult(payload,{...result,gameId:'b'}),null);
 assert.equal(matchingPredictionResult(payload,{...result,gameId:undefined,gameDate:'2026-10-17'}),null);
 assert.equal(matchingPredictionResult(payload,{...result,market:'rebounds'}),null);
 assert.equal(matchingPredictionResult(payload,result),result);
});
test('box scores preserve zero and comma-formatted totals while refusing missing and compound values',()=>{
 for(const v of [null,undefined,'','—','DNP','2/5'])assert.equal(statNumber(v),null);
 assert.equal(statNumber('0'),0);assert.equal(statNumber('1,020'),1020);assert.equal(statNumber('-2'),-2);
});
