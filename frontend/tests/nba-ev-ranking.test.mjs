import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {rankNbaCardsByEv,nbaCardEv}=await loadTs(new URL('../lib/nba-ev-ranking.ts',import.meta.url));
const now=Date.parse('2026-11-09T17:00:00Z');
function source(playerId,probability,side='OVER'){
 const over=probability,under=1-over;
 return {sport:'nba',market:'points',playerId:String(playerId),gameId:'1234',gameTime:'2026-11-09T23:00:00Z',
  quoteVersion:1,quoteId:'Q'+playerId,sportsbook:'Verified Book',sportsbookKey:'verified-book',
  sportsbookLine:14.5,overPrice:100,underPrice:100,lineType:'main',
  quoteUpdatedAt:'2026-11-09T16:59:00Z',boardCapturedAt:'2026-11-09T17:00:00Z',
  researchForecast:{status:'available',priceComparison:{overProbability:over,underProbability:under,pushProbability:0},
   modelSelection:{side,price:100,line:14.5,quoteId:'Q'+playerId,sportsbookKey:'verified-book',calculatedAt:'2026-11-09T16:59:30Z'}}
 };
}
const card=(id,probability,side='OVER')=>({rank:99,playerId:String(id),raw:source(id,probability,side)});
test('NBA ranked cards show ONLY positive verified EV, from highest to lowest',()=>{
 const rows=[card(1,.55),card(2,.565),card(3,.523),card(4,.8715),card(5,.45),card(6,.5)];
 const ranked=rankNbaCardsByEv(rows,now);
 assert.deepEqual(ranked.map(c=>c.playerId),['4','2','1','3']);
 assert.deepEqual(ranked.map(c=>c.rank),[1,2,3,4]);
 assert.deepEqual(rows.map(c=>c.rank),[99,99,99,99,99,99],'original historical ranks untouched');
 for(const c of ranked)assert.ok(nbaCardEv(c,now).percent>0);
});
test('no model selection or unverified/mismatched original quote means no NBA EV card',()=>{
 const good=card(7,.75);
 const invalid=[{...good,raw:{...good.raw,boardCapturedAt:null}},
 {...good,raw:{...good.raw,researchForecast:{status:'unavailable'}}},
 {...good,raw:{...good.raw,quoteId:'bad'}}];
 assert.equal(rankNbaCardsByEv(invalid,now).length,0);
});
test('negative OVER cannot be flipped to UNDER merely to rank',()=>{
 const over=card(8,.3);
 assert.equal(nbaCardEv(over,now),null);
 assert.deepEqual(rankNbaCardsByEv([over],now),[]);
});
