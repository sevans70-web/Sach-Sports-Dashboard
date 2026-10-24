import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {selectNbaCandidates,recordedNbaCandidates}=await loadTs(new URL('../lib/nba-ranking-candidates.ts',import.meta.url));
const now=Date.parse('2026-10-23T18:00Z'),stamp='2026-10-23T17:59Z',start='2026-10-23T23:00Z';
const row=i=>({rank:i+1,market:'points',quoteVersion:1,gameId:'g',playerId:String(i),gameTime:start,lineType:'main',sportsbook:'FanDuel',sportsbookKey:'fanduel',quoteId:'q'+i,overPrice:-110,underPrice:-110,sportsbookLine:9.5,quoteUpdatedAt:stamp,capturedAt:stamp,researchForecast:{status:'available',projection:12,modelSelection:{side:'OVER',line:9.5,price:-110,sportsbookKey:'fanduel',quoteId:'q'+i,calculatedAt:stamp}}});
test('Top 25 is selected after eligibility over the entire candidate pool',()=>{
 const candidates=Array.from({length:60},(_,i)=>({...row(i),...(i<20?{researchForecast:{status:'unavailable'}}:{})}));
 const selected=selectNbaCandidates(candidates,'points',now);
 assert.equal(selected.length,25);assert.equal(selected[0].playerId,'20');assert.equal(selected.at(-1).playerId,'44');
 assert.equal(selectNbaCandidates([row(1),row(1)],'points',now).length,1);
});
test('locked recovery uses only recorded pre-lock decisions and respects latest abstentions',()=>{
 const snapshot=(at,rows)=>({capturedAt:at,payload:{kind:'research_rankings',market:'points',rows}});
 const recovered=recordedNbaCandidates([
  snapshot(stamp,[row(1),row(2)]),
  snapshot('2026-10-23T18:01Z',[{...row(2),researchForecast:{status:'unavailable'}}]),
  snapshot('2026-10-23T23:01Z',[row(3)]),
 ],'points','2026-10-23',Date.parse(start),Date.parse('2026-10-24T01:00Z'));
 const selected=selectNbaCandidates(recovered,'points',Date.parse('2026-10-24T01:00Z'));
 assert.deepEqual(selected.map(r=>r.playerId),['1']);
 assert.equal(selected[0].boardCapturedAt,stamp);assert.equal(selected[0].researchForecast.projection,12);
});
