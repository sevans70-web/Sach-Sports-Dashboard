import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {nbaSlateRequest,nbaFixtureDay,nbaSlateRows,scopedNbaBoard}=await loadTs(new URL('../lib/nba-slate-scope.ts',import.meta.url));
test('relative date requests resolve Toronto dates across midnight, DST and year boundaries',()=>{
 for(const [at,previous,today,tomorrow] of [
 ['2026-10-29T03:59:59Z','2026-10-27','2026-10-28','2026-10-29'],
 ['2026-10-29T04:00:00Z','2026-10-28','2026-10-29','2026-10-30'],
 ['2026-11-01T07:00:00Z','2026-10-31','2026-11-01','2026-11-02'],
 ['2026-03-08T07:00:00Z','2026-03-07','2026-03-08','2026-03-09'],
 ['2027-01-01T06:00:00Z','2026-12-31','2027-01-01','2027-01-02']]){
  for(const [slate,day]of Object.entries({previous,today,tomorrow})){
   const url=new URL(nbaSlateRequest('points',slate,new Date(at)),'https://local');
   assert.equal(url.searchParams.get('day'),day);assert.equal(url.searchParams.get('calendar'),today);
  }
 }
 for(const slate of ['active','previous','today','tomorrow'])assert.notEqual(nbaSlateRequest('points',slate,new Date('2026-10-29T03:59Z')),nbaSlateRequest('points',slate,new Date('2026-10-29T04:00Z')));
});
test('scope handles UTC rollover and filters wrong date, market, missing and invalid fixture times without changing originals',()=>{
 const good={market:'points',gameTime:'2026-10-29T00:00Z',playerId:'1',gameId:'today',quoteId:'original',projection:12};
 const payload={market:'points',boardDay:'2026-10-28',rows:[good,{...good,gameTime:'2026-10-28T02:00Z'},{...good,gameTime:'2026-10-30T00:00Z'},{...good,market:'assists'},{...good,gameTime:'bad'},{...good,gameTime:null}],dropped:[good,{...good,gameTime:'bad'}]};
 const before=structuredClone(payload),result=scopedNbaBoard(payload,'points','2026-10-28');
 assert.deepEqual(result.rows,[good]);assert.deepEqual(result.dropped,[good]);assert.equal(result.publicRankingCount,1);assert.deepEqual(payload,before);
 assert.equal(nbaFixtureDay(good.gameTime),'2026-10-28');
 for(const patch of [{boardDay:'2026-10-27'},{market:'rebounds'}])assert.deepEqual(scopedNbaBoard({...payload,...patch},'points','2026-10-28').rows,[]);
 assert.deepEqual(nbaSlateRows([], 'points','2026-10-28'),[]);
});
test('every NBA market and combination is independently scoped',()=>{
 for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts','rebs_asts','steals','blocks','first_basket','q1_points','q1_rebounds','q1_assists','q1_threes_made','q1_pts_rebs_asts']){
  const rows=[{market,gameTime:'2026-10-29T01:00Z'},{market,gameTime:'2026-10-30T01:00Z'}];
  assert.deepEqual(scopedNbaBoard({rows},market,'2026-10-28').rows,[rows[0]]);
  assert.notEqual(nbaSlateRequest(market,'today'),nbaSlateRequest(market,'tomorrow'));
 }
});
