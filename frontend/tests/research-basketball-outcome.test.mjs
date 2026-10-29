import test from 'node:test';import assert from 'node:assert/strict';import{loadTs}from './load-ts.mjs';
const {researchBasketballOutcome:score}=await loadTs(new URL('../lib/research-basketball-outcome.ts',import.meta.url));
const time='2026-10-28T23:00:00Z';const make=(id='7',completed=true,dnp=false)=>({header:{id,competitions:[{date:time,status:{type:{completed}}}]},boxscore:{players:[{statistics:[{athletes:[{athlete:{id:'9'},didNotPlay:dnp}]}]}]}});
test('official DNP is void; absent stats remain unresolved and true zero is observed',()=>{
 assert.equal(score(make('7',true,true),'7',time,'9','points',[]).status,'void');
 assert.equal(score(make(),'7',time,'9','points',[]).status,'unresolved');
 assert.deepEqual(score(make(),'7',time,'9','points',[{playerId:'9',stats:{points:0}}]),{status:'observed',actual:0});
 assert.equal(score(make('7',true,true),'7',time,'9','points',[{playerId:'9',stats:{points:0}}]).status,'unresolved');
});
test('wrong fixture, mismatched time and unfinished games cannot settle',()=>{
 for(const [p,t]of [[make('8'),time],[make('7',false),time],[make(),'2026-10-29T23:00:00Z']])assert.equal(score(p,'7',t,'9','points',[]).status,'pending');
});
