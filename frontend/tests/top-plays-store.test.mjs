import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {updateTopPlayMarket,topPlayMarketState}=await loadTs(new URL('../lib/top-plays-store.ts',import.meta.url));
test('captures aggregate markets, replace empty boards and expire without approving an unvalidated model',()=>{
 const now=Date.now(),sport='test-capture';
 const row={quoteVersion:1,sportsbookKey:'fanduel',sportsbook:'FanDuel',playerId:'p',gameId:'g',gameTime:new Date(now+3600000).toISOString(),quoteUpdatedAt:new Date(now).toISOString(),lineType:'main',sportsbookLine:4.5,overPrice:-110,underPrice:-110,forecastModelId:'claimed-approved',forecastValidation:{passed:true},prediction:'OVER',modelProbability:99};
 updateTopPlayMarket(sport,{market:'points',rows:[row]},now);
 updateTopPlayMarket(sport,{market:'q1_points',rows:[row]},now);
 updateTopPlayMarket(sport,{market:'points',day:'2099-01-01',rows:[]},now);
 let state=topPlayMarketState(sport,now);assert.deepEqual(state.marketsChecked,['points','q1_points']);assert.equal(state.verifiedQuoteCount,2);assert.ok(state.plays.every(p=>p.pick===null));
 updateTopPlayMarket(sport,{market:'points',rows:[]},now);assert.equal(topPlayMarketState(sport,now).verifiedQuoteCount,1);
 state=topPlayMarketState(sport,now+15*60000);assert.equal(state.state,'awaiting_market_capture');assert.equal(state.verifiedQuoteCount,0);assert.ok(state.plays.every(p=>p.pick===null));assert.equal(topPlayMarketState('different-sport',now).marketsChecked.length,0);
});
