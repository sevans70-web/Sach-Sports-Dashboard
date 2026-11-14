import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {nhlCountDistribution,nhlCountProbabilities,evaluateNhlCountPrice,nhlCountMarket}=await loadTs(new URL('../lib/nhl-count-model.ts',import.meta.url));
const {fittedResearchForecast,attachFittedResearchForecasts}=await loadTs(new URL('../lib/live-model-forecast.ts',import.meta.url));
const {evaluatePrice}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const {rankingMarketCoverage}=await loadTs(new URL('../lib/ranking-market-coverage.ts',import.meta.url));
const {rankedModelComparison,estimatedEv}=await loadTs(new URL('../lib/estimated-ev.ts',import.meta.url));
const quote={sport:'nhl',market:'goals',period:'game',gameId:'g',playerId:'p',line:.5,overPrice:300,underPrice:-400};
test('count mass responds to mean, retains zero/multiple outcomes and integer pushes',()=>{
 for(const mean of [0,.3,.4,.6,1,3,20,100]){
  const d=nhlCountDistribution(mean),p=nhlCountProbabilities(mean,.5);
  assert.ok(Math.abs(d.probabilities.reduce((a,b)=>a+b,0)-1)<1e-12);
  assert.ok(Math.abs(d.probabilities.reduce((a,b,k)=>a+k*b,0)-mean)<1e-10);
  assert.ok(Math.abs(p.under-Math.exp(-mean))<1e-12);
  assert.equal(p.push,0);assert.equal(d.values.length,1001);
  assert.ok(d.values.every(v=>Number.isInteger(v)&&v>=0));
 }
 assert.ok(nhlCountProbabilities(.4,.5).over>nhlCountProbabilities(.3,.5).over);
 const p=nhlCountProbabilities(.6,1);assert.ok(Math.abs(p.push-.6*Math.exp(-.6))<1e-12);
 assert.equal(nhlCountProbabilities(0,0).push,1);
 assert.ok(Math.abs(nhlCountProbabilities(.6,-.5).over-1)<1e-12);
 assert.ok(nhlCountProbabilities(.6,.5).under>.5,'mean above line can legitimately favor UNDER');
 for(const v of [-1,NaN,Infinity,101])assert.throws(()=>nhlCountDistribution(v));
 assert.throws(()=>nhlCountProbabilities(.4,NaN));
});
test('same EV requirement permits long-odds OVER and favorite UNDER without quotas',()=>{
 const over=evaluateNhlCountPrice(.4,quote);
 assert.ok(over.over<.55);assert.ok(over.overEv>.03);assert.equal(over.candidateSide,'OVER');
 const under=evaluateNhlCountPrice(.3,{...quote,overPrice:190,underPrice:-250});
 assert.equal(under.candidateSide,'UNDER');assert.ok(under.underEv>.03);
 assert.equal(evaluateNhlCountPrice(Math.log(2),{...quote,overPrice:-110,underPrice:-110}).candidateSide,null);
 assert.equal(evaluatePrice([0,0,0,1],quote).candidateSide,null,'other sports retain existing default');
 assert.equal(nhlCountMarket('nba','assists'),false);assert.equal(nhlCountMarket('nhl','shots_on_goal'),false);
});
const linear=n=>({means:Array(10).fill(0),scales:Array(10).fill(1),coefficients:[n,...Array(10).fill(0)]});
const now=Date.parse('2026-11-13T12:00Z');
function fixture(market){
 const model={version:1,group:'nhl|'+market,workload:linear(20),rate:linear(.02),residuals:[-.4,-.3,-.2,1],minimum:0,integer:true,trainedThrough:'2025-01-01',calibratedThrough:'2025-04-01'};
 const row={sport:'nhl',market,season:'20262027',gameId:'g',playerId:'p',teamId:'A',gameTime:'2026-11-13T23:00Z',gameState:'pre',sportsbookLine:.5,overPrice:300,underPrice:-400,quoteVersion:1,quoteId:'q',sportsbookKey:'book',sportsbook:'Book',lineType:'main',quoteUpdatedAt:'2026-11-13T11:59Z',capturedAt:'2026-11-13T11:59:30Z'};
 const history=Array.from({length:6},(_,i)=>({...row,gameId:'prior'+i,gameTime:new Date(Date.UTC(2026,10,1+i)).toISOString(),actual:0,workload:20}));
 return {row,data:{models:[model],observations:history,digest:'test',asOf:'2026-11-01',gi:{},giStatus:{}}};
}
test('NHL runtime exposes count diagnostics but withholds unvalidated selections and old GI',()=>{
 for(const market of ['goals','assists']){
  const {row,data}=fixture(market);const original=structuredClone({row,data});
  const f=fittedResearchForecast(row,'nhl',market,data,now);
  assert.equal(f.status,'available');assert.equal(f.projection,.4);
  assert.ok(Math.abs(f.priceComparison.overProbability-(1-Math.exp(-.4)))<1e-12);
  assert.equal(f.modelSelection,null);assert.equal(f.giScore,null);assert.equal(f.candidateSide,null);
  assert.equal(f.selectionReason,'price_validation_failed');assert.equal(f.countModelValidation.selectionApproved,false);
  assert.equal(rankedModelComparison({...row,researchForecast:f},now),null);
  assert.equal(estimatedEv({...row,researchForecast:f},now).status,'unavailable');
  assert.equal(f.validatedForBetting,false);assert.deepEqual({row,data},original);
  assert.equal(fittedResearchForecast({...row,frozen:true},'nhl',market,data,now).status,'unavailable');
  assert.equal(fittedResearchForecast({...row,quoteUpdatedAt:'2026-11-12'},'nhl',market,data,now).priceComparison,null);
  const artifact={version:1,trainedThrough:'2026-08-01',calibrationRows:300,fixtures:40,blocks:[{maximumExpectedReturn:10,estimatedUnitReturn:.1}],positiveReturnReference:[.05,.1],validatedForBetting:false};
  const oldGi=fittedResearchForecast(row,'nhl',market,{...data,gi:{['nhl|'+market]:artifact}},now);
  assert.equal(oldGi.giScore,null);assert.equal(oldGi.modelSelection,null);
  const impossible={...data,models:[{...data.models[0],rate:linear(10)}]};
  assert.equal(fittedResearchForecast(row,'nhl',market,impossible,now).reason,'invalid_fitted_output');
 }
});
test('frozen saved NHL forecasts retain original side and probabilities byte for byte',async()=>{
 for(const market of ['goals','assists']){
  const {row}=fixture(market);const original={status:'available',projection:.4,modelSelection:{side:'UNDER'},priceComparison:{overProbability:.25,underProbability:.75,pushProbability:0}};
  const frozen={...row,boardFrozen:true,researchForecast:original};
  const result=await attachFittedResearchForecasts({market,rows:[frozen]},'nhl',now,{offlineOnly:true});
  assert.deepEqual(result.rows[0].researchForecast,original);assert.deepEqual(frozen.researchForecast,original);
 }
});
test('NHL coverage retains eight eligible UNDERs without relabeling or mutating them',()=>{
 const {row}=fixture('goals'),stamp=new Date(now).toISOString();
 const rows=Array.from({length:8},(_,i)=>({...row,playerId:String(i),underPrice:-110,boardCapturedAt:stamp,
  researchForecast:{status:'available',projection:.4,calculatedAt:stamp,
   priceComparison:{overProbability:.3,underProbability:.7,pushProbability:0},
   modelSelection:{side:'UNDER',line:.5,price:-110,quoteId:'q',sportsbookKey:'book',calculatedAt:stamp}}}));
 const original=structuredClone(rows);
 const coverage=rankingMarketCoverage('nhl','goals','2026-11-13',rows,now);
 assert.equal(coverage.games[0].rows,8);assert.equal(coverage.games[0].picks,8);
 assert.deepEqual(rows,original);
});
