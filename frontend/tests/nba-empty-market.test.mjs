import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nbaEmptyMarket,unpricedNbaQuarter}=await loadTs(new URL('../lib/nba-empty-market.ts',import.meta.url));
test('only unpriced quarter boards bypass archival; one verified quote preserves normal capture',()=>{
 assert.equal(unpricedNbaQuarter({market:'q1_points',rows:[]}),true);
 assert.equal(unpricedNbaQuarter({market:'q1_rebounds',rows:[{quoteVerified:false}]}),true);
 assert.equal(unpricedNbaQuarter({market:'q1_points',rows:[{quoteVerified:true}]}),false);
 assert.equal(unpricedNbaQuarter({market:'points',rows:[]}),false);
 assert.equal(unpricedNbaQuarter({market:'q1_points'}),false);
});
test('absent rows on a healthy feed do not start failure recovery or invent picks; feed failures remain failures',()=>{
 for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts','rebs_asts','steals','blocks','first_basket','q1_points','q1_rebounds','q1_assists','q1_threes_made','q1_pts_rebs_asts']){
  const r=nbaEmptyMarket(market,true);assert.equal(r.success,true);assert.equal(r.market,market);assert.deepEqual(r.rows,[]);assert.equal(r.saved,false);assert.equal(r.noQualifyingRows,true);assert.equal(nbaEmptyMarket(market,false),null);
 }
});
