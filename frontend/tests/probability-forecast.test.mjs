import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {fitLinear,predictLinear,distributionValues,outcomeProbabilities,empiricalCrps,clusteredMeanInterval,quoteProblem,evaluatePrice,forecastDistribution,evaluateProbabilityModels,probabilityInputs}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const game=(i,more={})=>({sport:'nfl',market:'passing_yards',season:'2025',playerId:'p',playerName:'P',gameId:String(i),gameTime:new Date(Date.UTC(2025,0,1+i*7)).toISOString(),teamId:'A',opponentId:'B',actual:210+i,workload:30,source:'official',retrievedAt:'2026-10-18',...more});
const quote=(more={})=>({sport:'nfl',market:'passing_yards',period:'game',gameId:'g',playerId:'p',bookmaker:'Book',quoteId:'q',line:200,overPrice:-110,underPrice:-110,updatedAt:'2026-09-01T11:55:00Z',capturedAt:'2026-09-01T11:56:00Z',decisionAt:'2026-09-01T12:00:00Z',mainLine:true,...more});
const target=game(1,{gameId:'g',gameTime:'2026-09-01T13:00:00Z'});
test('serializable train-only fit survives JSON roundtrip and nonfinite inputs fail',()=>{
 const m=fitLinear(Array.from({length:100},(_,i)=>({x:[i,2],y:3*i+1})));
 assert.ok(Math.abs(predictLinear(m,[49.5,2])-149.5)<1e-7);assert.ok(predictLinear(m,[50,2])>predictLinear(m,[49,2]));assert.deepEqual(JSON.parse(JSON.stringify(m)),m);
 assert.throws(()=>fitLinear([{x:[NaN],y:1}]),/Nonfinite/);assert.throws(()=>predictLinear(m,[1]),/Invalid/);
});
test('empirical distributions preserve negative yards, integer pushes and correct price payouts',()=>{
 const values=distributionValues({residuals:[-10,0,10],minimum:null,integer:true},5);
 assert.deepEqual(values,[-5,5,15]);assert.deepEqual(outcomeProbabilities(values,5),{over:1/3,under:1/3,push:1/3});
 assert.deepEqual(distributionValues({residuals:[-10,0,10],minimum:0,integer:true},5),[0,5,15]);
 const p=evaluatePrice([200,210,220,230],quote({line:200,overPrice:150}));
 assert.equal(p.overEv,1.125);assert.equal(p.push,.25);assert.equal(p.candidateSide,'OVER');
 assert.equal(evaluatePrice([200],quote()).candidateSide,null);
});
test('CRPS matches brute force and cannot be improved merely by widening forecasts',()=>{
 const xs=[-5,1,3,8],actual=2;
 const brute=xs.reduce((s,x)=>s+Math.abs(x-actual),0)/xs.length-xs.flatMap(x=>xs.map(y=>Math.abs(x-y))).reduce((s,x)=>s+x,0)/(2*xs.length**2);
 assert.equal(empiricalCrps(xs,actual),brute);assert.equal(empiricalCrps([2],2),0);
 assert.ok(empiricalCrps([-100,100],2)>empiricalCrps(xs,2));
});
test('exact quote identity, period, provenance and frozen pregame timing are mandatory',()=>{
 assert.equal(quoteProblem(quote(),target),null);
 for(const patch of [{playerId:'other'},{gameId:'other'},{period:'q1'},{mainLine:false},{bookmaker:''},{underPrice:null},{updatedAt:'2026-09-01T11:44:00Z'},{capturedAt:'2026-09-01T12:01:00Z'},{decisionAt:target.gameTime}])assert.ok(quoteProblem(quote(patch),target),JSON.stringify(patch));
});
test('QB backup appearances cannot create a false low starting expectation, including Nelson-like zero/two attempts',()=>{
 const history=Array.from({length:5},(_,i)=>game(i));
 const baseline=probabilityInputs(history,game(8));
 assert.deepEqual(probabilityInputs([...history,game(1.5,{gameId:'backup',actual:0,workload:2})],game(8)),baseline);
 assert.equal(probabilityInputs([...history,game(6,{actual:0,workload:2})],game(8)).reason,'latest_passing_role_uncertain');
 assert.equal(probabilityInputs(history,game(8,{market:'q1_passing_yards'})).reason,'unsupported_market');
});
function dataset(){
 const rows=[];
 for(const season of ['2025','2026'])for(let p=0;p<24;p++)for(let i=0;i<28;i++)rows.push(game(i,{season,playerId:String(p),gameId:season+'-'+p+'-'+i,gameTime:new Date(Date.UTC(Number(season),0,1+i*7)).toISOString(),actual:180+p+i,workload:30}));
 return rows;
}
test('calibration outcomes change uncertainty but never fitted coefficients; later outcomes change neither',()=>{
 const rows=dataset(),a=evaluateProbabilityModels(rows),model=a.models[0];assert.ok(model);
 assert.ok(Date.parse(model.trainedThrough)+48*3600000<Date.parse(a.reports[0].calibrationStartsAt));
 const calibrationChange=rows.map(g=>g.season==='2025'&&Date.parse(g.gameTime)>=Date.parse(a.reports[0].calibrationStartsAt)?{...g,actual:g.actual+25}:g);
 const b=evaluateProbabilityModels(calibrationChange).models[0];assert.deepEqual(b.workload,model.workload);assert.deepEqual(b.rate,model.rate);assert.notDeepEqual(b.residuals,model.residuals);
 const laterChange=rows.map(g=>g.season==='2026'?{...g,actual:g.actual+50}:g);
 assert.deepEqual(evaluateProbabilityModels(laterChange).models,a.models);
 assert.equal(a.giEnabled,false);assert.equal(a.validatedForBetting,false);assert.equal(a.reports[0].exactQuoteSamples,0);
 assert.equal(a.reports[0].brier,null);assert.equal(a.reports[0].candidateRoi,null);
 assert.throws(()=>evaluateProbabilityModels([...rows,rows[0]]),/Duplicate/);
 assert.throws(()=>evaluateProbabilityModels(rows,[quote(),quote()]),/Multiple selected/);
});
test('forecast artifacts cannot be used before calibration was available or on another market',()=>{
 const model=evaluateProbabilityModels(dataset()).models[0];
 assert.equal(forecastDistribution(model,[],game(1)).reason,'model_not_available_before_target');
 assert.equal(forecastDistribution(model,[],game(1,{market:'rushing_yards'})).reason,'wrong_group');
 const history=Array.from({length:6},(_,i)=>game(i,{season:'2026',gameTime:new Date(Date.UTC(2026,0,1+i*7)).toISOString()}));
 const result=forecastDistribution(JSON.parse(JSON.stringify(model)),history,{...game(10),season:'2026',gameTime:'2026-04-01T00:00:00Z'});
 assert.equal(result.reason,null);assert.ok(result.forecast.values.length>=100);
});
test('fixture-cluster uncertainty cannot treat many player rows in one game as independent games',()=>{
 assert.equal(clusteredMeanInterval(Array.from({length:100},()=>({gameId:'one',value:1}))),null);
 const rows=Array.from({length:12},(_,i)=>({gameId:String(i),value:1}));
 const interval=clusteredMeanInterval(rows);assert.equal(interval.clusters,12);assert.equal(interval.lower95,1);assert.equal(interval.upper95,1);
 assert.deepEqual(clusteredMeanInterval(rows),interval);
});
test('quote evaluation uses archived decision-time features and reports actual price calibration only on exact joins',()=>{
 const rows=dataset(),g=rows.find(r=>r.season==='2026'&&r.playerId==='0'&&r.gameId==='2026-0-20');
 const decisionAt=new Date(Date.parse(g.gameTime)-3600000).toISOString();
 const q=quote({gameId:g.gameId,playerId:g.playerId,decisionAt,capturedAt:decisionAt,updatedAt:decisionAt,line:200.5});
 const report=evaluateProbabilityModels(rows,[q]).reports[0];
 assert.equal(report.exactQuoteSamples,1);assert.ok(Number.isFinite(report.brier));assert.ok(Number.isFinite(report.marketBrier));
 const history=Array.from({length:5},(_,i)=>game(i));
 const before=probabilityInputs(history,game(8),'2025-01-25T00:00:00Z');
 assert.deepEqual(before,probabilityInputs(history.slice(0,4),game(8),'2025-01-25T00:00:00Z'));
});
