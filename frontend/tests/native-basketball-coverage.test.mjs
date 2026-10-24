import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nativeBasketballCoverage}=await loadTs(new URL('../lib/native-basketball-coverage.ts',import.meta.url));
test('native discovery deduplicates market IDs, identifies period types, and forwards only explicit public quote fields',()=>{
 const m={marketId:'m1',eventId:1,marketType:'PLAYER_POINTS_Q1',marketName:'First Quarter Points',runners:[{runnerName:'Player',privateDebug:'never-public',winRunnerOdds:{americanDisplayOdds:{americanOdds:-110}}}]};
 const r=nativeBasketballCoverage({secret:'private',data:{tab:{attachments:{markets:{m1:m,duplicate:m,full:{marketId:'m2',marketType:'PLAYER_POINTS'},first:{marketId:'m3',marketType:'BASKETBALL_FIRST_BASKET'}}}}}});
 assert.equal(r.periodCandidates.length,2);assert.deepEqual(r.marketTypes.find(([type])=>type==='PLAYER_POINTS_Q1'),['PLAYER_POINTS_Q1',1]);assert.equal(r.truncated,false);assert.equal(r.periodCandidates.find(p=>p.marketId==='m1').runnerSample[0].americanOdds,-110);assert.ok(!JSON.stringify(r).includes('never-public'));assert.ok(!JSON.stringify(r).includes('private'));
});
