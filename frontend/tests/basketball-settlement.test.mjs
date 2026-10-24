import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {basketballSummaryActual,basketballLogActual}=await loadTs(new URL('../lib/basketball-settlement.ts',import.meta.url));
test('box score grading uses authoritative player IDs and parses made threes from ESPN made-attempted cells',()=>{
 const box={boxscore:{players:[{statistics:[{labels:['PTS','REB','AST','3PT'],athletes:[{athlete:{id:'1',displayName:'Same Name'},stats:['20','5','7','2-6']},{athlete:{id:'2',displayName:'Same Name'},stats:['0','0','0','0-3']}]}]}]}};
 assert.equal(basketballSummaryActual(box,{playerId:'1'},'threes_made'),2);assert.equal(basketballSummaryActual(box,{playerId:'2'},'points'),0);assert.equal(basketballSummaryActual(box,{playerId:'3',playerName:'Same Name'},'points'),null);assert.equal(basketballSummaryActual(box,{playerId:'1'},'pts_rebs_asts'),32);
});
test('game log fallback never selects missing dates or a different game and preserves missing vs zero',()=>{
 const payload={names:['points','threePointFieldGoalsMade'],events:{wrong:{},right:{gameDate:'2026-10-17T21:00:00Z'}},seasonTypes:[{categories:[{type:'event',events:[{eventId:'wrong',stats:['99','8']},{eventId:'right',stats:['0','']}]}]}]};
 assert.equal(basketballLogActual(payload,{gameId:'right'},'points','2026-10-17'),0);assert.equal(basketballLogActual(payload,{gameId:'right'},'threes_made','2026-10-17'),null);assert.equal(basketballLogActual(payload,{gameId:'missing'},'points','2026-10-17'),null);assert.equal(basketballLogActual(payload,{},'points','2026-10-17'),0);
});

test('full-game settlement requires the exact completed fixture, including fallback grading',async()=>{
 const {basketballFixtureFinal}=await loadTs(new URL('../lib/basketball-settlement.ts',import.meta.url));
 const p={header:{id:'123',competitions:[{status:{type:{completed:false,state:'in'}}}]}};
 assert.equal(basketballFixtureFinal(p,'123'),false);
 p.header.competitions[0].status.type.completed=true;
 assert.equal(basketballFixtureFinal(p,'123'),true);
 assert.equal(basketballFixtureFinal(p,'456'),false);
 assert.equal(basketballFixtureFinal(null,'123'),false);
});
