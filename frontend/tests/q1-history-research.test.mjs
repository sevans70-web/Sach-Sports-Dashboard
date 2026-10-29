import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {quarterHistoryInput,quarterContractProbabilities,quarterResearchDistribution}=await loadTs(new URL('../lib/q1-history-research.ts',import.meta.url));
const target={sport:'nfl',market:'q1_receiving_yards',playerId:'p',teamId:'t',gameTime:'2026-10-29T23:00:00Z'};
const history=Array.from({length:5},(_,i)=>({...target,gameId:String(i),season:'2026',gameTime:`2026-10-${10+i}T23:00:00Z`,actual:i===0?-3:i,workload:i}));
test('quarter inputs ignore target actual, target workload and unavailable results',()=>{
 const a=quarterHistoryInput(history,target),b=quarterHistoryInput([...history,{...target,actual:999,workload:999,gameId:'future',season:'2026'}],{...target,actual:999,workload:999});assert.deepEqual(a,b);assert.equal(a.prior[0].actual,-3);assert.equal(quarterHistoryInput(history,target,'2026-10-30T00:00:00Z'),null);
});
test('quarter history needs five same-player same-team prior results',()=>{assert.equal(quarterHistoryInput(history.slice(1),target),null);assert.equal(quarterHistoryInput(history,{...target,teamId:'other'}),null)});
test('milestone equality is reached, main equality is push',()=>{assert.deepEqual(quarterContractProbabilities([0,5,8],5,'milestone'),{over:2/3,under:1/3,push:0});assert.deepEqual(quarterContractProbabilities([0,5,8],5,'main'),{over:1/3,under:1/3,push:1/3})});
test('NFL negative yards remain possible; NBA counts have a zero floor',()=>{assert.deepEqual(quarterResearchDistribution(1,[-4,0,2],'nfl'),[-3,1,3]);assert.deepEqual(quarterResearchDistribution(1,[-4,0,2],'nba'),[0,1,3])});
