import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {retainedCfbRows,cfbTimeBlock}=await loadTs(new URL('../lib/cfb-retained-board.ts',import.meta.url));
const {rankingTimeBlocks}=await loadTs(new URL('../lib/ranking-time-blocks.ts',import.meta.url));
const game={id:'a',awayTeam:'A',homeTeam:'B',awayTeamId:'1',homeTeamId:'2',date:'2026-10-17T16:00:00Z',state:'post',completed:true};
const saved={market:'rushing_yards',playerId:'123',playerName:'Original',teamName:'A',gameId:'a',matchup:'A @ B',gameTime:game.date,rank:4,sportsbookLine:25.5,modelProjection:43,modelProbability:62,giScore:64,bookmakerCount:1,savedAt:'2026-10-17T15:00:00Z',status:'hit',actual:51};
const now=Date.parse('2026-10-18T01:00:00Z');
test('completed cards restore original values and actuals after the book removes the game',()=>{
 const input=Object.freeze({...saved});
 const [row]=retainedCfbRows([input],[game],'2026-10-17','early',now);
 assert.equal(row.rank,4);assert.equal(row.sportsbookLine,25.5);assert.equal(row.modelProjection,43);assert.equal(row.giScore,64);assert.equal(row.actualResult,51);assert.equal(row.resultStatus,'hit');assert.equal(row.gameState,'post');assert.equal(row.frozen,true);
 assert.match(row.headshot,/123\.png$/);assert.equal(row.quoteVersion,undefined);assert.equal(input.status,'hit');
});
test('retention stops on the next game day and never borrows another opponent or time block',()=>{
 assert.equal(retainedCfbRows([saved],[game],'2026-10-18','early',now).length,0);
 assert.equal(retainedCfbRows([saved],[game],'2026-10-17','evening',now).length,0);
 assert.equal(retainedCfbRows([{...saved,gameId:'other',matchup:'A @ C'}],[game],'2026-10-17','early',now).length,0);
 assert.equal(retainedCfbRows([{...saved,withdrawnFromBoard:true}],[game],'2026-10-17','early',now).length,0);
});
test('a late saved snapshot stays research instead of becoming a retrospectively successful pregame pick',()=>{
 const [row]=retainedCfbRows([{...saved,savedAt:'2026-10-17T17:00:00Z'}],[game],'2026-10-17','early',now);
 assert.equal(row.recoveredAfterStart,true);assert.equal(row.lockedAtKickoff,false);assert.equal(row.resultStatus,'void');assert.equal(row.modelProjection,43);
});
test('retained scorer quotes and genuine zero results keep their recorded values',()=>{
 const [row]=retainedCfbRows([{...saved,market:'first_td',sportsbookLine:null,actual:0,quoteVersion:1,sportsbook:'FanDuel',overPrice:500}],[game],'2026-10-17','early',now);
 assert.equal(row.sportsbookLine,null);assert.equal(row.actualResult,0);assert.equal(row.sportsbook,'FanDuel');assert.equal(row.overPrice,500);
});
test('all-day hides empty blocks and identifies finished blocks for default collapse',()=>{
 const blocks=rankingTimeBlocks([{gameState:'post',raw:{slateKey:'early'}},{gameState:'in',raw:{slateKey:'evening'}}]);
 assert.deepEqual(blocks.map(b=>b.key),['evening','early']);assert.equal(blocks[0].completed,false);assert.equal(blocks[1].completed,true);
 assert.deepEqual(rankingTimeBlocks([]),[]);
});
test('time blocks use Toronto time, including games after UTC midnight',()=>{
 assert.equal(cfbTimeBlock('2026-10-17T16:00:00Z'),'early');assert.equal(cfbTimeBlock('2026-10-17T19:30:00Z'),'afternoon');assert.equal(cfbTimeBlock('2026-10-18T02:00:00Z'),'evening');
});
