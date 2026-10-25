import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {todayTopPlays}=await loadTs(new URL('../lib/top-plays.ts',import.meta.url));
const now=Date.parse('2026-10-23T18:00Z');
const row={playerId:'p',gameId:'g',gameTime:'2026-10-23T23:00Z',market:'points',prediction:'OVER',modelProbability:99,giScore:100,recommendationEligible:true,forecastValidation:{passed:true},quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',sportsbookLine:20.5,lineType:'main',overPrice:500,underPrice:-700,quoteUpdatedAt:'2026-10-23T17:59Z'};
test('a client eligibility flag, high score or bookmaker probability cannot promote an unvalidated model',()=>{
 assert.ok(todayTopPlays([row],'nba',now).every(card=>card.pick===null));
});
test('basketball has four categories; football and hockey do not offer first basket',()=>{
 for(const sport of ['nba','wnba','cbb'])assert.equal(todayTopPlays([],sport,now).length,4);
 for(const sport of ['nfl','cfb','nhl','mlb'])assert.deepEqual(todayTopPlays([],sport,now).map(c=>c.key),['play','value','long']);
});
test('featured cards reuse an exact saved pregame model selection and its side-specific probability/EV',()=>{
 const q={...row,capturedAt:'2026-10-23T17:59:30Z',quoteId:'q',overPrice:-110,underPrice:-110,boardCapturedAt:'2026-10-23T17:59:30Z',researchForecast:{modelSelection:{side:'UNDER',line:20.5,price:-110,quoteId:'q',sportsbookKey:'book',calculatedAt:'2026-10-23T17:59:30Z'},priceComparison:{overProbability:.3,underProbability:.7,underExpectedReturn:.33,overExpectedReturn:-.3}}};
 const cards=todayTopPlays([q],'nba',now);assert.equal(cards[0].pick.row.prediction,'UNDER');assert.equal(cards[0].pick.probability,70);assert.equal(cards[1].pick,null);
 assert.ok(todayTopPlays([{...q,quoteId:'different'}],'nba',now).every(c=>c.pick===null));
 assert.ok(todayTopPlays([q],'nba',Date.parse(q.gameTime)+1).every(c=>c.pick===null));
});
test('first basket and price-qualified scorer long shots display book-implied chances without inventing model value',()=>{
 const q={...row,market:'first_basket',lineType:'scorer',overPrice:500,underPrice:null};
 const cards=todayTopPlays([q],'nba',now);assert.equal(cards[2].pick.basis,'bookmaker_implied');assert.equal(cards[2].pick.probability,16.7);assert.equal(cards[2].pick.row.prediction,'FIRST BASKET');assert.equal(cards[1].pick,null);assert.equal(cards[3].pick,null);assert.equal(cards[0].pick,null);
});

test('every dashboard gives each featured category a different player across multiple markets',()=>{
 const base={...row,capturedAt:'2026-10-23T17:59:30Z',quoteId:'q',overPrice:500,underPrice:-700,researchForecast:{modelSelection:{side:'OVER',line:20.5,price:500,quoteId:'q',sportsbookKey:'book',calculatedAt:'2026-10-23T17:59:30Z'},priceComparison:{overProbability:.7,underProbability:.3,overExpectedReturn:3.2,underExpectedReturn:-.5}}};
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){const cards=todayTopPlays([base,{...base,market:'rebounds'},{...base,playerId:'b'},{...base,playerId:'c'}],sport,now);assert.deepEqual(cards.filter(c=>c.pick).map(c=>c.pick.row.playerId),['b','c','p']);}
});
