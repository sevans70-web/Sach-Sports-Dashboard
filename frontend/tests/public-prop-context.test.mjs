import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {datedCardHistory:history,publicPropContext:context}=await loadTs(new URL('../lib/public-prop-context.ts',import.meta.url));
test('passing history excludes low-volume backups, prior seasons and post-kickoff data',()=>{
 const points=[{date:'2025-10-01',season:2025,value:400,workload:35},{date:'2026-10-01',season:2026,value:0,workload:2},{date:'2026-10-02',season:2026,value:220,workload:31},{date:'2026-10-18T18:00Z',season:2026,value:300,workload:35},{date:'2026-10-03',season:2026,value:'',workload:30}];
 assert.deepEqual(history(points,'2026-10-18T17:00Z','passing_yards','nfl'),[220]);
 assert.deepEqual(history(points,'2026-10-18T17:00Z','q1_passing_yards','nfl'),[]);
});
test('descriptive sample average and line counts use dated observations and never become a pick or GI',()=>{
 const r=context({quoteVerified:true,sportsbookLine:20.5,gameTime:'2026-10-18',researchCohort:{observations:[10,20,30,40,50].map((value,i)=>({value,date:`2026-10-0${i+1}`,included:true}))}},'nfl','receiving_yards');
 assert.equal(r.recentAverage,30);assert.equal(r.recentLabel,'Last 5 avg.');assert.match(r.face,/3 of the last 5/);assert.equal(r.giScore,undefined);assert.equal(r.prediction,undefined);assert.doesNotMatch(r.face,/stored|unvalidated|coverage|baseline/i);
});
test('live facts use the latest live stat, even when the ranking snapshot has an older actual field',()=>{
 const r=context({gameState:'in',actualResult:119,liveCurrent:154,quoteVerified:true,sportsbookLine:274.5},'nfl','passing_yards');assert.match(r.face,/Currently at 154 yards/);assert.doesNotMatch(r.face,/119/);
});
