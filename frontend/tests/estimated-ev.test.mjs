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

test('saved probability evidence is deterministic across file order and exact fixture/quote constraints',async()=>{
 const {selectSavedQuoteEvidence,savedQuoteQuery}=await loadTs(new URL('../lib/saved-quote-evidence.ts',import.meta.url));
 const early=row(),late={...row('UNDER',100,[.45,.55,0]),boardCapturedAt:'2026-10-25T16:01Z'};
 assert.equal(selectSavedQuoteEvidence([late,early],'g','q',now+60000).row,early);assert.equal(selectSavedQuoteEvidence([early,late],'g','q',now+60000).row,early);
 assert.equal(selectSavedQuoteEvidence([early,{...late,gameId:'other'}],null,null,now).ambiguous,true);
 assert.equal(selectSavedQuoteEvidence([early,{...late,quoteId:'other'}],'g',null,now).ambiguous,true);
 assert.equal(selectSavedQuoteEvidence([early],'other','q',now).row,null);
 const datedLate={...late,researchForecast:{...late.researchForecast,modelSelection:{...late.researchForecast.modelSelection,calculatedAt:'2026-10-25T16:01Z'}}};assert.equal(selectSavedQuoteEvidence([early,datedLate],'g','q',now+60000,'2026-10-25T16:01Z').row,datedLate);assert.equal(selectSavedQuoteEvidence([early],'g','q',now,'missing').row,null);
 const featured={...late,_featured:true};assert.equal(selectSavedQuoteEvidence([early,featured],'g','q',now+60000).row,featured);
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb'])assert.equal(savedQuoteQuery({...early,sport,quoteId:'book x/1'}),'&gameId=g&quoteId=book%20x%2F1&forecastAt=2026-10-25T16%3A00Z');
});

test('all eight sports reject failed, retimed and quote-spliced selection evidence',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
  const r={...row('UNDER',-120,[.35,.55,.1]),sport};
  assert.ok(Math.abs(estimatedEv(r,now).percent-(.55*100/120-.35)*100)<1e-10);
  const f=r.researchForecast;
  for(const bad of [
   {...r,researchForecast:{...f,status:'unavailable'}},
   {...r,researchForecast:{...f,selectionReason:'price_validation_failed'}},
   {...r,researchForecast:{...f,calculatedAt:'2026-10-25T15:59Z'}},
   {...r,researchForecast:{...f,modelSelection:{...f.modelSelection,calculatedAt:'2026-10-25T15:58Z'}}},
   {...r,researchForecast:{...f,priceComparison:{...f.priceComparison,quoteEvidence:{quoteId:'other',line:r.sportsbookLine,sportsbookKey:r.sportsbookKey,overPrice:r.overPrice,underPrice:r.underPrice,calculatedAt:f.modelSelection.calculatedAt}}}},
  ])assert.equal(estimatedEv(bad,now).status,'unavailable',sport);
 }
});

test('new quote-bound probability evidence remains usable and rejects every altered identity field',()=>{
 const r={...row(),sport:'nba',market:'points'},f=r.researchForecast;
 const quoteEvidence={sport:r.sport,market:r.market,gameId:r.gameId,playerId:r.playerId,quoteId:r.quoteId,sportsbookKey:r.sportsbookKey,line:r.sportsbookLine,overPrice:r.overPrice,underPrice:r.underPrice,calculatedAt:f.modelSelection.calculatedAt};
 const bound={...r,researchForecast:{...f,calculatedAt:f.modelSelection.calculatedAt,priceComparison:{...f.priceComparison,quoteEvidence}}};
 assert.equal(estimatedEvText(bound,now),'+10.0%');
 for(const [key,value] of Object.entries(quoteEvidence)){
  const bad={...bound,researchForecast:{...bound.researchForecast,priceComparison:{...bound.researchForecast.priceComparison,quoteEvidence:{...quoteEvidence,[key]:typeof value==='number'?value+1:'other'}}}};
  assert.equal(estimatedEv(bad,now).status,'unavailable',key);
 }
});
