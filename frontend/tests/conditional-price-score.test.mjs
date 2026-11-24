import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {conditionalPriceScore}=await loadTs(new URL('../lib/conditional-price-score.ts',import.meta.url));
test('integer-line binary Brier conditions out push mass, while a push is excluded from binary scoring',()=>{
 const p={over:.2,under:.3,push:.5},r=conditionalPriceScore(p,11,10,.5);assert.equal(r.conditionalOver,.4);assert.equal(r.modelBrier,.36);assert.equal(r.bookBrier,.25);assert.notEqual(r.modelBrier,(p.over-1)**2);
 const push=conditionalPriceScore(p,10,10,.5);assert.equal(push.push,true);assert.equal(push.modelBrier,null);assert.equal(push.bookBrier,null);assert.deepEqual(p,{over:.2,under:.3,push:.5});
});
test('half-line scores are unchanged; malformed distributions and impossible settlement mass fail instead of silently dropping losses',()=>{
 assert.equal(conditionalPriceScore({over:.6,under:.4,push:0},11,10.5,.5).modelBrier,(.6-1)**2);
 for(const p of [{over:.2,under:.3,push:.2},{over:NaN,under:.3,push:.7},{over:1.2,under:-.2,push:0},{over:0,under:0,push:1}])assert.throws(()=>conditionalPriceScore(p,11,10,.5));
 assert.equal(conditionalPriceScore({over:0,under:0,push:1},10,10,.5).modelBrier,null);
});
