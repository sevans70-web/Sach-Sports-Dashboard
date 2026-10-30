import{readResearchCohort}from'./p01-official-results.mjs';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {loadTs} from '../tests/load-ts.mjs';
const dir=process.argv[2];if(!dir)throw Error('Frozen cohort directory required');
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>readFile(new URL(p,root));
const source='model-research/2026-10-19/nfl-saved-quotes/',candidate='model-research/2026-10-27/p01-football-matchup/';
const manifest=JSON.parse(await read(source+'source-manifest.json')),sourceBytes=await read(source+'opportunity-observations.json.gz'),raw=gunzipSync(sourceBytes);assert.equal(hash(sourceBytes),manifest.compressedSha256);assert.equal(hash(raw),manifest.dataSha256);
const candidateBytes=await read(candidate+'models.json.gz'),models=JSON.parse(gunzipSync(candidateBytes));assert.equal(hash(candidateBytes),'79303f4e40be17a05187444c61aa308f87cde97d79cf516f588b4ca52404dfc2');
const runtimeManifest=JSON.parse(await read('model-runtime/manifest.json')),runtimeBytes=await read('model-runtime/snapshot.json.gz');assert.equal(hash(runtimeBytes),runtimeManifest.sha256);const runtime=JSON.parse(gunzipSync(runtimeBytes));
const officialBytes=await read('model-research/2026-10-27/p01-matchup-saved-replay/official-responses.json.gz');
const {footballModelObservations}=await loadTs(new URL('../lib/football-model-observations.ts',import.meta.url)),{footballMatchupIndex}=await loadTs(new URL('../lib/football-matchup-inputs.ts',import.meta.url));
const {forecastDistribution,predictLinear,distributionValues,evaluatePrice,quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url)),{forecastInputReceipt}=await loadTs(new URL('../lib/forecast-input-receipt.ts',import.meta.url));
const key=g=>[g.sport,g.market,g.gameId,g.playerId].join('|'),merged=new Map(JSON.parse(raw).map(g=>[key(g),g]));
for(const r of JSON.parse(gunzipSync(officialBytes)))for(const g of footballModelObservations(r.data,{sport:'nfl',season:String(r.data.header.season.year),gameId:r.gameId,source:r.url,retrievedAt:r.retrievedAt},'game',0))merged.set(key(g),g);
const observations=[...merged.values()],inputs=footballMatchupIndex(observations);
const cohortBytes=await readResearchCohort(dir),receipt=JSON.parse(await readFile(dir+'/receipt.json','utf8'));assert.equal(hash(cohortBytes),receipt.sha256);const c=JSON.parse(cohortBytes);assert.equal(c.protocol.study,'p01-prospective-matchup-v1');assert.equal(c.decisions.length,receipt.decisions);assert.ok(c.decisions.length>0);assert.equal(c.protocol.candidateSha256,hash(candidateBytes));assert.equal(c.protocol.runtimeSha256,hash(runtimeBytes));assert.equal(c.protocol.sourceSha256,manifest.dataSha256);assert.equal(c.protocol.officialSupplementSha256,hash(officialBytes));
const seen=new Set();for(const d of c.decisions){
 const k=[d.target.market,d.target.gameId,d.target.playerId].join('|');assert.ok(!seen.has(k));seen.add(k);assert.equal(quoteProblem(d.quote,d.target),null);assert.ok(Date.parse(d.quote.decisionAt)>=Date.parse(c.protocol.createdAt));assert.ok(Date.parse(d.target.gameTime)>Date.parse(c.completedAt));
 const f=c.fixtures.find(f=>Date.parse(f.gameTime)===Date.parse(d.target.gameTime)&&f.teams?.includes(d.target.teamId)&&f.teams?.includes(d.target.opponentId));assert.ok(f);assert.ok(f.url.endsWith('event='+d.target.gameId));
 const model=models.find(m=>m.group==='nfl|'+d.target.market),old=runtime.models.find(m=>m.group===model.group),features=inputs(d.target,d.quote.decisionAt);assert.ok(features.features);assert.ok(Date.parse(model.calibratedThrough)<Date.parse(d.quote.decisionAt)-48*3600000);
 const baseline=forecastDistribution(old,observations,d.target,d.quote.decisionAt).forecast;assert.ok(baseline);assert.equal(baseline.projection,d.baseline.projection);assert.deepEqual(evaluatePrice(baseline.values,d.quote),d.baseline.price);
 const rawPoint=predictLinear(model.direct,features.features),projection=model.minimum==null?rawPoint:Math.max(model.minimum,rawPoint);assert.equal(projection,d.candidate.projection);assert.deepEqual(evaluatePrice(distributionValues(model,projection),d.quote),d.candidate.price);
 assert.deepEqual(d.baseline.inputReceipt,forecastInputReceipt(old.group,hash(runtimeBytes),d.quote.decisionAt,baseline.inputFeatures));assert.deepEqual(d.candidate.inputReceipt,forecastInputReceipt(model.group,hash(candidateBytes),d.quote.decisionAt,features.features));
}
console.log(JSON.stringify({verified:c.decisions.length,forecastsReplayed:c.decisions.length*2,games:new Set(c.decisions.map(d=>d.target.gameId)).size,sourceAndModelHashes:true,livePromotion:false}));
