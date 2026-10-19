import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {workloadDistributionValues,evaluateProbabilityModels,forecastDistribution}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const artifact={minimum:null,integer:true,residuals:[-500,500],workloadCalibration:Array.from({length:200},(_,i)=>({expectedWorkload:i<100?5:30,residual:i<100?-2:20}))};
test('calibration follows predicted workload, with deterministic ties and JSON persistence',()=>{
 assert.deepEqual(workloadDistributionValues(artifact,10,5),Array(100).fill(8));
 assert.deepEqual(workloadDistributionValues(JSON.parse(JSON.stringify(artifact)),10,30),Array(100).fill(30));
 assert.deepEqual(workloadDistributionValues(artifact,10,17.5),Array(100).fill(8));
 assert.equal(workloadDistributionValues({...artifact,minimum:0},1,5)[0],0);
});
test('sparse, negative or nonfinite workload calibration cannot emit probabilities',()=>{
 for(const patch of [{workloadCalibration:artifact.workloadCalibration.slice(0,199)},{workloadCalibration:[...artifact.workloadCalibration,{expectedWorkload:-1,residual:0}]},{workloadCalibration:[...artifact.workloadCalibration,{expectedWorkload:5,residual:NaN}]}])assert.throws(()=>workloadDistributionValues({...artifact,...patch},10,5),/Invalid workload calibration/);
 assert.throws(()=>workloadDistributionValues(artifact,10,NaN),/Invalid workload calibration/);
});
const rows=[];
for(const season of ['2025','2026'])for(let p=0;p<24;p++)for(let i=0;i<28;i++)rows.push({sport:'nba',market:'points',season,playerId:String(p),playerName:String(p),gameId:season+'-'+p+'-'+i,gameTime:new Date(Date.UTC(Number(season),0,1+i*7)).toISOString(),teamId:'A',opponentId:'B',actual:10+p+i%4,workload:15+p,source:'official',retrievedAt:'2026-10-19'});
test('conditional calibration keeps frozen fits and never uses later target outcomes or realized minutes',()=>{
 const pooled=evaluateProbabilityModels(rows),local=evaluateProbabilityModels(rows,[],{calibration:'workload'}),m=local.models[0];
 assert.ok(m.workloadCalibration.length>=200);
 for(const field of ['workload','rate','residuals','trainedThrough','calibratedThrough'])assert.deepEqual(m[field],pooled.models[0][field]);
 const altered=rows.map(r=>r.season==='2026'?{...r,actual:r.actual+100,workload:r.workload+20}:r);
 assert.deepEqual(evaluateProbabilityModels(altered,[],{calibration:'workload'}).models,local.models);
 const target=rows.find(r=>r.season==='2026'&&r.playerId==='0'&&r.gameId.endsWith('-20'));
 const a=forecastDistribution(m,rows,target);
 // Alter only the target fixture: prior observations remain legitimate inputs.
 const targetOnly=rows.map(r=>r===target?{...r,actual:999,workload:999}:r);
 assert.deepEqual(forecastDistribution(m,targetOnly,{...target,actual:999,workload:999}),a);
 assert.ok(a.forecast);
 assert.equal(local.giEnabled,false);assert.equal(local.validatedForBetting,false);
 assert.throws(()=>evaluateProbabilityModels(rows,[],{calibration:'unknown'}),/Unsupported/);
});
