import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {basketballMarketCoverage}=await loadTs(new URL('../lib/basketball-market-coverage.ts',import.meta.url));
test('coverage distinguishes period markets and excludes full-game or first-field-goal substitutions',()=>{
 const p={data:[{books:[{props:[{category:'points'},{category:'points',periodID:'1q'},{category:'firstBasket'},{category:'first_field_goal'}]}]}]};
 const r=basketballMarketCoverage(p);assert.equal(r.props,4);assert.equal(r.markets.q1_points.matched,1);assert.equal(r.markets.first_basket.matched,1);assert.equal(r.markets.q1_points.priced,0);assert.equal(r.markets.q1_rebounds.matched,0);assert.ok(!JSON.stringify(r).includes('playerName'));
});
