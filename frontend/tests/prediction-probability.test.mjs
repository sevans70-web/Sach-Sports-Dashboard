import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {predictionProbability,predictionAccuracy}=await loadTs(new URL('../lib/prediction-probability.ts',import.meta.url));
const now=Date.parse('2026-10-25T16:00Z');
function row(side='OVER',price=100,probabilities=[.55,.45,0]){
 return {playerId:'p',gameId:'g',market:'passing_yards',gameTime:'2026-10-25T17:00Z',quoteVersion:1,quoteId:'q',sportsbook:'Book',sportsbookKey:'book',lineType:'main',sportsbookLine:200.5,overPrice:side==='OVER'?price:-110,underPrice:side==='UNDER'?price:-110,quoteUpdatedAt:'2026-10-25T15:59Z',capturedAt:'2026-10-25T16:00Z',boardCapturedAt:'2026-10-25T16:00Z',researchForecast:{status:'available',priceComparison:{overProbability:probabilities[0],underProbability:probabilities[1],pushProbability:probabilities[2]},modelSelection:{side,price,line:200.5,quoteId:'q',sportsbookKey:'book',calculatedAt:'2026-10-25T16:00Z'}}};
}
test('probability follows original UNDER side, preserves push mass and excludes unsupported evidence',()=>{
 const r=row('UNDER',100,[.2,.7,.1]);const p=predictionProbability(r,now);assert.equal(p.win,.7);assert.equal(p.push,.1);assert.equal(p.side,'UNDER');assert.equal(predictionProbability({...r,quoteId:'wrong'},now),null);
 assert.deepEqual(predictionProbability({...r,gameState:'post',actual:999},now+86400000),p);
});
test('accuracy separates sport market and side, uses conditional Brier and excludes duplicates and pending',()=>{
 const a={...row('UNDER',100,[.2,.7,.1]),sport:'nfl',status:'hit'};
 const report=predictionAccuracy([a,a,{...a,gameId:'g2',status:'miss'},{...a,gameId:'g3',status:'push'},{...a,gameId:'g4',status:'pending'},{...a,sport:'cfb'},{...a,market:'receiving_yards'}],now);
 assert.equal(report.groups.length,3);assert.equal(report.excluded,2);const g=report.groups.find(g=>g.sport==='nfl'&&g.market==='passing_yards');assert.equal(g.settled,2);assert.equal(g.pushes,1);assert.equal(g.hitRate,.5);assert.ok(Math.abs(g.meanProbability-7/9)<1e-12);assert.ok(Math.abs(g.brier-((7/9-1)**2+(7/9)**2)/2)<1e-12);
});

test('all eight sport integrations enforce evidence and reject failed validation, future decisions and mismatched grades',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
  const r={...row(),sport,status:'hit',pickSide:'OVER'};assert.equal(predictionProbability(r,now).win,.55);
  assert.equal(predictionAccuracy([{...r,pickSide:'UNDER'}],now).groups.length,0);
  assert.equal(predictionProbability({...r,researchForecast:{...r.researchForecast,selectionReason:'price_validation_failed'}},now),null);
  assert.equal(predictionProbability(r,now-1000),null);
 }
});
