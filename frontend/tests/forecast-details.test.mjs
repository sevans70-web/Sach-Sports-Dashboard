import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {forecastDetailText}=await loadTs(new URL('../lib/public-card-metrics.ts',import.meta.url));
test('PRA and other combined model cards render without a nonexistent uncertainty range or workload',()=>{
 assert.equal(forecastDetailText({status:'available',projection:34.6,modelId:'sum_of_fitted_component_expectations'},null),'Combined model estimate.');
 for(const interval80 of [undefined,null,{}, {lower:0}, {lower:NaN,upper:10}])assert.equal(forecastDetailText({interval80},null),'Model estimate.');
});
test('a genuine zero and a supplied complete interval remain visible beside the exact saved price',()=>{
 assert.equal(forecastDetailText({expectedWorkload:0,workloadUnit:'minutes',interval80:{lower:0,upper:10}},{sportsbook:'Original Book',price:120}),'Original Book · +120 · 0 expected minutes · range 0–10.');
});
