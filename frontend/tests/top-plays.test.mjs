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
