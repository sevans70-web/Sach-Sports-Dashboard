import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {retainedTopPlays}=await loadTs(new URL('../lib/retained-top-plays.ts',import.meta.url));
const row={playerId:'1',gameId:'g',playerName:'Original',market:'first_basket',gameTime:'2026-10-25T02:00Z',capturedAt:'2026-10-25T01:53Z',quoteUpdatedAt:'2026-10-25T01:52Z',quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',lineType:'scorer',overPrice:550};
test('pregame first-basket and long-shot evidence stays visible after final tipoff, without using the outcome',()=>{
 const now=Date.parse('2026-10-25T02:14Z'),cards=retainedTopPlays([{rows:[row]}],'nba',now);
 assert.equal(cards[2].pick.row.playerName,'Original');assert.equal(cards[2].pick.probability,15.4);assert.equal(cards[3].pick,null);
 assert.deepEqual(cards.map(c=>c.pick?.probability),retainedTopPlays([{rows:[{...row,actualResult:0}]}],'nba',now).map(c=>c.pick?.probability));
 assert.ok(retainedTopPlays([{rows:[{...row,capturedAt:'2026-10-25T02:01Z'}]}],'nba',now).every(c=>!c.pick));
 assert.ok(retainedTopPlays([{rows:[row]}],'nba',Date.parse('2026-10-26T02:14Z')).every(c=>!c.pick));
});


test('saved pregame pool fills value and long shot with the next distinct qualifying players on all sports',()=>{
 const at='2026-10-25T01:53Z',now=Date.parse('2026-10-25T02:14Z');
 const rows=['a','b','c'].map(playerId=>({...row,playerId,playerName:playerId,market:'passing_yards',lineType:'main',sportsbookLine:20.5,overPrice:500,underPrice:-700,quoteId:playerId,
  researchForecast:{modelSelection:{side:'OVER',line:20.5,price:500,quoteId:playerId,sportsbookKey:'book',calculatedAt:at},priceComparison:{overProbability:.7,underProbability:.3,overExpectedReturn:3.2,underExpectedReturn:-.5}}}));
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
  const cards=retainedTopPlays([{rows}],sport,now);
  assert.deepEqual(cards.filter(c=>c.pick).map(c=>c.pick.row.playerId),['a','b','c']);
  assert.ok(cards.filter(c=>c.pick).every(c=>c.pick.row.featuredRetained));
 }
});
