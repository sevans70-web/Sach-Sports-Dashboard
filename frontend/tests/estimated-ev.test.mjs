import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {estimatedEv,estimatedEvText}=await loadTs(new URL('../lib/estimated-ev.ts',import.meta.url));
const now=Date.parse('2026-10-25T16:00Z');
function row(side='OVER',price=100,probabilities=[.55,.45,0]){
 return {playerId:'p',gameId:'g',market:'passing_yards',gameTime:'2026-10-25T17:00Z',quoteVersion:1,quoteId:'q',sportsbook:'Book',sportsbookKey:'book',lineType:'main',sportsbookLine:200.5,overPrice:side==='OVER'?price:-110,underPrice:side==='UNDER'?price:-110,quoteUpdatedAt:'2026-10-25T15:59Z',capturedAt:'2026-10-25T16:00Z',boardCapturedAt:'2026-10-25T16:00Z',researchForecast:{status:'available',priceComparison:{overProbability:probabilities[0],underProbability:probabilities[1],pushProbability:probabilities[2]},modelSelection:{side,price,line:200.5,quoteId:'q',sportsbookKey:'book',calculatedAt:'2026-10-25T16:00Z'}}};
}
test('estimated EV uses selected side, American payout and zero-profit pushes',()=>{
 assert.equal(estimatedEvText(row(),now),'+10.0%');assert.equal(estimatedEvText(row('UNDER',100,[.45,.55,0]),now),'+10.0%');assert.equal(estimatedEvText(row('OVER',-110),now),'+5.0%');assert.equal(estimatedEvText(row('OVER',-110,[.5,.5,0]),now),'-4.5%');assert.equal(estimatedEvText(row('OVER',100,[.55,.35,.1]),now),'+20.0%');assert.equal(estimatedEvText(row('OVER',100,[.5,.5,0]),now),'0.0%');
});
test('stale/mismatched quotes, failed validation and book-implied scorer chances cannot create EV',()=>{
 const good=row();for(const r of [{...good,quoteUpdatedAt:'2026-10-25T15:00Z'},{...good,quoteId:'other'},{...good,underPrice:null},{...good,giScore:99,researchForecast:null},{...good,researchForecast:{...good.researchForecast,giReason:'price_validation_failed'}},{...good,lineType:'scorer',researchForecast:{status:'unavailable'}},{...good,researchForecast:{...good.researchForecast,priceComparison:{overProbability:55,underProbability:45,pushProbability:0}}}])assert.equal(estimatedEv(r,now).status,'unavailable');
});
test('saved pregame EV survives kickoff and final results without using outcomes',()=>{
 const r=row(),before=estimatedEv(r,now);assert.deepEqual(estimatedEv({...r,gameState:'post',actualResult:0,boardFrozen:true},now+86400000),before);assert.deepEqual(estimatedEv(r,now+3600000),before);assert.equal(before.odds,100);assert.equal(before.quoteId,'q');assert.equal(before.validatedForBetting,false);
 const late={...r,boardCapturedAt:'2026-10-25T18:00Z'};assert.equal(estimatedEv(late,now+86400000).status,'unavailable');
});
test('shared EV arithmetic applies to all eight sports without a GI dependency',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb'])assert.equal(estimatedEvText({...row(),sport,giScore:null},now),'+10.0%');
});
