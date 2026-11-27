import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {resolve} from 'node:path';import {loadTs} from './load-ts.mjs';
import {workerModelRuntimePlugin} from '../build/worker-model-runtime.mjs';
const {nbaSupportingHistory,validatedNbaSupportingHistory}=await loadTs(new URL('../lib/nba-supporting-history.ts',import.meta.url));
const {basketballModelObservations}=await loadTs(new URL('../lib/basketball-model-observations.ts',import.meta.url));
const {nbaCombinationHistory}=await loadTs(new URL('../lib/nba-combination-history.ts',import.meta.url));
const {fittedResearchForecast,createRuntimeForecastIndex}=await loadTs(new URL('../lib/live-model-forecast.ts',import.meta.url));
const {playerCardHistory}=await loadTs(new URL('../lib/player-card-history.ts',import.meta.url));
const pack=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nba-population-sources-2026-11-23.json.gz',import.meta.url))));
const refreshed=pack.evidence.filter(e=>e.source.includes('/summary?')).flatMap(e=>basketballModelObservations(e.payload,{sport:'nba',season:String(e.payload.header.season.year),gameId:String(e.payload.header.id),source:e.source,retrievedAt:e.observedAt}));
const code=workerModelRuntimePlugin().transform('',resolve('lib/worker-model-runtime.ts'));
const {workerModelRuntime}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const key=o=>[o.sport,o.market,o.playerId,o.gameId].join('|');let example;
for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'])test('all eligible recorded NBA '+market+' forecasts carry their exact supporting history, including lower roles',()=>{
 const base=workerModelRuntime('nba',market),merged=new Map(base.observations.map(o=>[key(o),o]));for(const o of refreshed)merged.set(key(o),o);
 let observations=[...merged.values()];if(market.startsWith('pts_')){
  const combined=new Map((base.combinationPrebuilt?observations.filter(o=>o.market===market):[]).map(o=>[key(o),o]));for(const o of nbaCombinationHistory(observations,market))combined.set(key(o),o);observations=[...combined.values()];
 }
 const data={...base,observations},index=createRuntimeForecastIndex(observations);let checked=0;
 for(const row of pack.rows){
  const original=JSON.stringify(row),f=fittedResearchForecast({...row,market},'nba',market,data,pack.clock,index);if(f.status!=='available')continue;
  const value={...row,market,researchForecast:f},h=validatedNbaSupportingHistory(value,market);
  assert.ok(h,`${row.playerName}/${row.playerId}: available forecast must have its model history`);assert.ok(h.points.length>=5);assert.equal(h.modelGameIds.length,Math.min(10,h.points.length));
  assert.deepEqual(h,nbaSupportingHistory(row,market,observations,f.inputReceipt)&&validatedNbaSupportingHistory(value,market));
  const displayed=playerCardHistory(h,'nba',market,row.gameTime,row.gameId,true);assert.deepEqual(displayed,h.points);assert.equal(JSON.stringify(row),original);
  if(market==='points')example={value,market,h};checked++;
 }
 assert.ok(checked>100,'Exercise the full eligible roster population, beyond the top25');
 console.log(JSON.stringify({market,eligibleForecastHistoriesVerified:checked,source:'existing authorized November23 census; no new provider or price audit'}));
});
test('chart evidence rejects wrong identities, stale receipt bindings, future games, altered statistics and missing source timestamps',()=>{
 assert.ok(example);const {value,market}=example;for(const mutate of [r=>r.playerId='other',r=>r.gameId='other',r=>r.teamId='other',r=>r.researchForecast.inputReceipt.sha256='other',r=>r.researchForecast.supportingHistory.points.at(-1).value+=1,r=>r.researchForecast.supportingHistory.points.at(-1).date=r.gameTime,r=>r.researchForecast.supportingHistory.points.at(-1).retrievedAt='',r=>r.researchForecast.supportingHistory.market='assists',r=>r.researchForecast.supportingHistory.points.push(r.researchForecast.supportingHistory.points[0])]){
  const r=structuredClone(value);mutate(r);assert.equal(validatedNbaSupportingHistory(r,market),null);
 }
 assert.equal(validatedNbaSupportingHistory({...value,researchForecast:{}},market),null,'No backfill onto old forecasts');
});
test('a newly fetched source keeps its actual receipt time without restamping the pregame forecast',()=>{
 const {value,market}=example,r=structuredClone(value),decision=r.researchForecast.inputReceipt.decisionAt;
 r.researchForecast.supportingHistory.points.at(-1).retrievedAt=new Date(Date.parse(decision)+2000).toISOString();
 assert.ok(validatedNbaSupportingHistory(r,market));assert.equal(r.researchForecast.inputReceipt.decisionAt,decision);
 r.researchForecast.supportingHistory.points.at(-1).retrievedAt=r.gameTime;assert.equal(validatedNbaSupportingHistory(r,market),null);
});
