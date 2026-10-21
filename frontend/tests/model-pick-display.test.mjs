import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {cardModelPick,prioritizeModelPicks,modelPickNotice}=await loadTs(new URL('../lib/saved-model-pick.ts',import.meta.url));
const now=Date.parse('2026-10-21T12:00:00Z');
const selected={playerId:'selected',gameId:'game',gameTime:'2026-10-21T23:00:00Z',gameState:'pre',quoteVersion:1,quoteVerified:true,lineType:'main',sportsbook:'Book',sportsbookKey:'book',quoteId:'quote',sportsbookLine:9.5,overPrice:-110,underPrice:-132,quoteUpdatedAt:'2026-10-21T11:59:00Z',capturedAt:'2026-10-21T11:59:30Z',researchForecast:{status:'available',modelSelection:{side:'UNDER',line:9.5,price:-132,sportsbookKey:'book',quoteId:'quote',calculatedAt:'2026-10-21T11:59:45Z'}}};
test('actual model selections appear ahead of unsupported rows in the five-card preview',()=>{
 const unsupported=Array.from({length:4},(_,i)=>({playerId:'none'+i,rank:i+1,researchForecast:{status:'unavailable',reason:'prior_basketball_role_uncertain'}}));
 const rows=[...unsupported,{...selected,rank:5},{...selected,playerId:'second',rank:6}],before=JSON.stringify(rows);
 const sorted=prioritizeModelPicks(rows,now);
 assert.deepEqual(sorted.map(r=>r.playerId),['selected','second','none0','none1','none2','none3']);
 assert.deepEqual(sorted.map(r=>r.rank),[1,2,3,4,5,6]);
 assert.equal(cardModelPick(sorted[0],now).side,'UNDER');assert.equal(cardModelPick(sorted[0],now).line,9.5);
 assert.equal(JSON.stringify(rows),before);
 assert.deepEqual(sorted[0].researchForecast,selected.researchForecast);
});
test('unverified, stale and mismatched quote selections cannot be promoted or displayed',()=>{
 for(const row of [{...selected,sportsbookLine:10.5},{...selected,underPrice:-115},{...selected,quoteId:'wrong'},{...selected,quoteUpdatedAt:'2026-10-21T10:00:00Z'},{...selected,gameState:'in'}])assert.equal(cardModelPick(row,now),null);
 assert.equal(cardModelPick({...selected,researchForecast:{status:'unavailable'}},now),null);
});
test('locked rankings retain their recorded order, and saved selections survive current quote freshness',()=>{
 const frozen={...selected,rank:2,boardFrozen:true,boardCapturedAt:'2026-10-21T12:00:00Z'};
 const rows=[{playerId:'none',rank:1,boardFrozen:true},frozen];
 assert.strictEqual(prioritizeModelPicks(rows,now+20*3600000),rows);
 assert.equal(cardModelPick(frozen,now+20*3600000).side,'UNDER');
});
test('unsupported cards explain why they have no pick without manufacturing a direction',()=>{
 assert.equal(modelPickNotice({researchForecast:{reason:'prior_basketball_role_uncertain'}}),'Role is uncertain');
 assert.equal(modelPickNotice({researchForecast:{selectionReason:'price_threshold_not_met'}}),'No qualifying price');
 assert.equal(cardModelPick({researchForecast:{projection:30},sportsbookLine:9.5},now),null);
});
