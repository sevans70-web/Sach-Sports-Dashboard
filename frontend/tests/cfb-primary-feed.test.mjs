import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {getOwlsCfbRows}=await loadTs(new URL('../lib/cfb-owls.ts',import.meta.url));
test('an executable CFB primary quote does not wait for or call the optional exhausted provider',async()=>{
 let secondaryCalls=0;const now=Date.now();
 const payload={data:[{homeTeam:'B',awayTeam:'A',commenceTime:new Date(now+3600000).toISOString(),books:[{key:'pinnacle',props:[{playerName:'Quarterback',category:'passing_yards',line:279.5,overPrice:-110,underPrice:-110,lastUpdate:new Date(now).toISOString()}]}]}]};
 const rows=await getOwlsCfbRows('passing_yards',{primary:async()=>payload,supplement:async()=>{secondaryCalls++;throw Error('quota exhausted')}});
 assert.equal(rows.length,1);assert.equal(rows[0].line,279.5);assert.equal(secondaryCalls,0);
});
test('missing primary coverage may use the supplement, never invent a main line',async()=>{
 let calls=0;const rows=await getOwlsCfbRows('passing_yards',{primary:async()=>({data:[]}),supplement:async()=>{calls++;return {data:[]}}});assert.equal(calls,1);assert.equal(rows.length,0);
});
