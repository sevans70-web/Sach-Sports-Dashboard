import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {forecastInputReceipt}=await loadTs(new URL('../lib/forecast-input-receipt.ts',import.meta.url));
const {evaluateProbabilityModels,forecastDistribution,predictLinear}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
test('refreshed features change their own fingerprint even when model snapshot stays the same',()=>{
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
  const x=[30,7],a=forecastInputReceipt(sport+'|market','model','2026-10-28T12:00Z',x);
  assert.deepEqual(forecastInputReceipt(a.group,'model',a.decisionAt,x),a);
  assert.notEqual(forecastInputReceipt(a.group,'model',a.decisionAt,[31,7]).sha256,a.sha256);
  assert.notEqual(forecastInputReceipt(a.group,'different',a.decisionAt,x).sha256,a.sha256);
  x[0]=999;assert.equal(a.features[0],30);assert.deepEqual(JSON.parse(JSON.stringify(a)),a);
 }
 for(const xs of [[],[NaN],[Infinity],['30']])assert.throws(()=>forecastInputReceipt('nfl|passing_yards','model','2026-10-28',xs),/Invalid/);
});
test('the retained feature vector reproduces the fitted point forecast after serialization',()=>{
 const games=[];for(const season of ['2025','2026'])for(let p=0;p<24;p++)for(let i=0;i<28;i++)games.push({sport:'nfl',market:'passing_yards',season,playerId:String(p),playerName:'P',gameId:season+'-'+p+'-'+i,gameTime:new Date(Date.UTC(+season,0,1+i*7)).toISOString(),teamId:'A',opponentId:'B',actual:180+p+i,workload:30,source:'official',retrievedAt:'2026-10-28'});
 const model=evaluateProbabilityModels(games).models[0],g=games.at(-1),f=forecastDistribution(model,games,g).forecast;
 const saved=JSON.parse(JSON.stringify(forecastInputReceipt(model.group,'model',g.gameTime,f.inputFeatures)));
 const projection=Math.max(0,predictLinear(model.workload,saved.features))*predictLinear(model.rate,saved.features);
 assert.equal(projection,f.projection);
});
