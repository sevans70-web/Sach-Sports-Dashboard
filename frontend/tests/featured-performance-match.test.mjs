import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {matchingFeaturedResult,featuredSelectionDispute}=await loadTs(new URL('../lib/featured-performance-match.ts',import.meta.url));
const row={playerId:'1',gameId:'2',market:'passing_yards',prediction:'UNDER',sportsbookLine:200.5};
const good={...row,pickSide:'UNDER',status:'hit',actual:200};
test('featured grades require the exact original decision and line across every sport',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
 assert.equal(matchingFeaturedResult({...row,sport},[{...good,sportsbookLine:210.5}]),null);
 assert.equal(matchingFeaturedResult({...row,sport},[{...good,gameId:'other'},{...good,recoveredAfterStart:true},good]),good);
 }
 assert.equal(matchingFeaturedResult({...row,sportsbookLine:null},[good]),null);
});
test('disputed October 25 NFL Long Shot is excluded without substituting an unverified Waller pick',()=>{
 assert.match(featuredSelectionDispute('nfl','2026-10-25','long'),/excluded/);
 assert.equal(featuredSelectionDispute('nfl','2026-10-25','play'),null);
 assert.equal(featuredSelectionDispute('nba','2026-10-25','long'),null);
});

test('First TD saved result matches only verified scoring order with identical original scorer quote',()=>{
 const pick={playerId:'1',gameId:'2',market:'first_td',prediction:'YES',sportsbookLine:null,quoteVersion:1,sportsbookKey:'pinnacle',quoteUpdatedAt:'2026-10-25T10:00:00Z'};
 const grade={...pick,pickSide:'YES',status:'hit',actual:1,resultSource:'verified_first_touchdown_order'};
 assert.equal(matchingFeaturedResult(pick,[grade]),grade);
 assert.equal(matchingFeaturedResult(pick,[{...grade,resultSource:'official_final_boxscore'}]),null);
 assert.equal(matchingFeaturedResult(pick,[{...grade,sportsbookKey:'other'}]),null);
 assert.equal(matchingFeaturedResult(pick,[{...grade,gameId:'wrong'}]),null);
});
