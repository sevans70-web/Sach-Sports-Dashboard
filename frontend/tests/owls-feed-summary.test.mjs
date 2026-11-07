import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {owlsFeedSummary}=await loadTs(new URL('../lib/owls-feed-summary.ts',import.meta.url));
test('counts real market coverage without leaking provider metadata or raw records',()=>{
 const result=owlsFeedSummary({token:'private',meta:{secret:'private'},data:[{secret:'private',books:[{props:[{category:'points',playerName:'private',line:20.5},{category:'rebounds'},{category:'https://private'}]}]}]});
 assert.deepEqual(result,{games:1,books:1,props:3,categories:{points:1,rebounds:1},availability:'markets_available'});assert.ok(!JSON.stringify(result).includes('private'));
});
test('empty and malformed feeds cannot imply available markets',()=>{
 for(const data of [undefined,{}, {data:[]},{data:[{books:null}]}])assert.equal(owlsFeedSummary(data).availability,'no_provider_markets');
});
