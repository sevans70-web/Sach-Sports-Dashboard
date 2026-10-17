import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {footballHistoryValues}=await loadTs(new URL('../lib/football-history.ts',import.meta.url));
test('football projections receive oldest-to-newest games regardless of provider order',()=>{
 const p={names:['passingYards'],events:{a:{gameDate:'2026-10-10'},b:{gameDate:'2026-10-03'},c:{gameDate:'2026-09-26'}},seasonTypes:[{categories:[{type:'event',events:[{eventId:'a',stats:['300']},{eventId:'b',stats:['200']},{eventId:'c',stats:['100']}]}]}]};
 assert.deepEqual(footballHistoryValues(p,['passingyards']),[100,200,300]);
});
test('football history keeps actual zero, skips absent statistics and deduplicates games',()=>{
 const p={names:['rushingYards'],seasonTypes:[{categories:[{type:'event',events:[{eventId:'1',stats:[null]},{eventId:'2',stats:['0']},{eventId:'3',stats:['—']},{eventId:'2',stats:['0']}]}]}]};
 assert.deepEqual(footballHistoryValues(p,['rushingyards']),[0]);
});
const {footballSummaryStat}=await loadTs(new URL('../lib/football-history.ts',import.meta.url));
const athlete={id:'1',displayName:'Test Quarterback'};
const summary={boxscore:{players:[{statistics:[
 {name:'passing',labels:['C/ATT','YDS','TD'],athletes:[{athlete,stats:['23/35','300','5']}]},
 {name:'rushing',labels:['CAR','YDS','TD'],athletes:[{athlete,stats:['10','50','1']}]},
 {name:'receiving',labels:['REC','YDS','TD'],athletes:[{athlete,stats:['2','15','2']}]}
]}]}};
test('quarterback passing and rushing yards grade from their own categories; completions parse C/ATT',()=>{
 assert.equal(footballSummaryStat(summary,'passing_yards','1','Test Quarterback'),300);
 assert.equal(footballSummaryStat(summary,'rushing_yards','1','Test Quarterback'),50);
 assert.equal(footballSummaryStat(summary,'pass_completions','1','Test Quarterback'),23);
});
test('anytime scorer grading and history sum rushing and receiving TDs, excluding passing TDs',()=>{
 assert.equal(footballSummaryStat(summary,'anytime_td','1','Test Quarterback'),3);
 const log={names:['rushingTouchdowns','receivingTouchdowns'],seasonTypes:[{categories:[{type:'event',events:[{eventId:'1',stats:[1,2]}]}]}]};
 assert.deepEqual(footballHistoryValues(log,[['rushingtouchdowns'],['receivingtouchdowns']]),[3]);
});
