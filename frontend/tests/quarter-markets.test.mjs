import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {basketballMarketMatches:match,verifiedNbaPrediction:verified}=await loadTs(new URL('../lib/basketball-markets.ts',import.meta.url));
const {basketballQ1Actual:q1,basketballFirstBasketActual:first}=await loadTs(new URL('../lib/basketball-period-settlement.ts',import.meta.url));
const {VISIBLE_SPORTS}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
const {NFL_ACTIVE_MARKETS}=await loadTs(new URL('../lib/nfl.ts',import.meta.url));
const {playerBaseline}=await loadTs(new URL('../lib/nba.ts',import.meta.url));
const {uniqueRankingRows}=await loadTs(new URL('../lib/unique-ranking-rows.ts',import.meta.url));
test('provider names with college suffixes collapse by roster ID without losing other games',()=>{
 const rows=[{playerId:'1',playerName:'Player',matchup:'A @ B',gameTime:'2026-10-17T19:00:00Z',frozen:true},{playerId:'1',playerName:'Player (OSU)',matchup:'A @ B',gameTime:'2026-10-17T19:00:00Z'},{playerId:'1',playerName:'Player',matchup:'A @ C',gameTime:'2026-10-24T19:00:00Z'}];assert.equal(uniqueRankingRows(rows).length,2);assert.equal(uniqueRankingRows(rows)[0].frozen,true);
});
test('public sports exclude MLB/soccer; active NFL Q1 has exactly the three yardage markets',()=>{
 assert.deepEqual(VISIBLE_SPORTS,['nfl','cfb','nba','wnba','nhl','cbb']);assert.deepEqual(NFL_ACTIVE_MARKETS.map(x=>x[0]).filter(x=>x.startsWith('q1_')),['q1_passing_yards','q1_receiving_yards','q1_rushing_yards']);
});
test('basketball period matching never leaks a full game, half or team total into Q1',()=>{
 assert.equal(match({category:'points'},'q1_points'),false);assert.equal(match({category:'points',periodID:'1q'},'q1_points'),true);assert.equal(match({category:'points_1q'},'q1_points'),true);assert.equal(match({category:'points',periodID:'1h'},'q1_points'),false);assert.equal(match({category:'points',periodID:'1q'},'points'),false);assert.equal(match({category:'first_field_goal'},'first_basket'),false);assert.equal(match({category:'firstBasket'},'first_basket'),true);
});
test('first-basket price-only predictions capture without a numeric O/U; research never captures',()=>{
 assert.equal(verified({marketBacked:true,prediction:'FIRST BASKET',modelProbability:12},'first_basket'),true);assert.equal(verified({marketBacked:false,prediction:'OVER',modelProjection:5,sportsbookLine:4.5},'q1_points'),false);assert.equal(verified({marketBacked:true,prediction:'OVER',modelProjection:5,sportsbookLine:4.5},'q1_points'),true);
 assert.equal(playerBaseline({pointsPerGame:24},'q1_points'),6);assert.equal(playerBaseline({pointsPerGame:null},'q1_points'),null);
});
function payload(){return {header:{competitions:[{status:{period:2,type:{completed:false}},competitors:[{linescores:[{value:4}]},{linescores:[{value:3}]}]}]},plays:[
 {sequenceNumber:1,period:{number:1},text:'Alex One makes free throw 1 of 2',scoringPlay:true,scoreValue:1,homeScore:1,awayScore:0},
 {sequenceNumber:2,period:{number:1},text:'Ben Two makes 3-point jump shot (Alex One assists)',scoringPlay:true,scoreValue:3,homeScore:1,awayScore:3},
 {sequenceNumber:3,period:{number:1},text:'Alex One defensive rebound'},
 {sequenceNumber:4,period:{number:1},text:'Alex One makes 3-point jump shot',scoringPlay:true,scoreValue:3,homeScore:4,awayScore:3},
 {sequenceNumber:5,period:{number:2},text:'Alex One makes 3-point jump shot',scoringPlay:true,scoreValue:3,homeScore:7,awayScore:3}]}}
test('Q1 grading counts only a complete first quarter, including FTs, rebounds, assists and threes',()=>{
 const p=payload(),player={playerName:'Alex One'};assert.equal(q1(p,player,'q1_points'),4);assert.equal(q1(p,player,'q1_pts_rebs_asts'),6);assert.equal(q1(p,player,'q1_threes_made'),1);assert.equal(q1(p,{playerName:'Absent Player'},'q1_points'),null);
 p.header.competitions[0].status.period=1;assert.equal(q1(p,player,'q1_points'),null);p.header.competitions[0].status.period=2;p.plays.shift();assert.equal(q1(p,player,'q1_points'),null);
});
test('first basket counts the first score including free throws, not the assister or a truncated later score',()=>{
 const p=payload();assert.equal(first(p,{playerName:'Alex One'}),1);assert.equal(first(p,{playerName:'Ben Two'}),0);p.plays.shift();assert.equal(first(p,{playerName:'Ben Two'}),null);
});
