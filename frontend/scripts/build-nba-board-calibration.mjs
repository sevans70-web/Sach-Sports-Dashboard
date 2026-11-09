// Rebuild the research artifacts from the existing, frozen model snapshots.
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {loadTs} from '../tests/load-ts.mjs';
const q=JSON.parse(gunzipSync(await readFile('model-runtime/quarter-snapshot.json.gz')));
const {quarterFeatureIndex,fitQuarterModel}=await loadTs(new URL('../lib/quarter-forecast.ts',import.meta.url));
const quarter={};
for(const existing of q.models.filter(m=>/^nba\|q1_(points|rebounds|assists)$/.test(m.group))){
 const observations=q.rows.flatMap(r=>{const f=q.fixtures[r[0]],p=q.players[r[1]],m=q.markets[r[2]];return m.join('|')===existing.group?[{sport:m[0],market:m[1],gameId:f[0],gameTime:f[1],season:f[2],playerId:p[0],teamId:p[1],actual:r[3],role:r[4],starter:r[5]===1}]:[]}).sort((a,b)=>a.gameTime.localeCompare(b.gameTime));
 const inputs=quarterFeatureIndex(observations);
 const rows=observations.filter(g=>Number(g.season)<2026).flatMap(g=>{const f=inputs(g);return f.features?[{...g,features:f.features}]:[]});
 const dates=[...new Set(rows.map(g=>g.gameTime))],boundary=dates[Math.floor(dates.length*.65)];
 const train=rows.filter(g=>Date.parse(g.gameTime)<Date.parse(boundary)-48*3600000),cal=rows.filter(g=>g.gameTime>=boundary);
 const model=fitQuarterModel(existing.group,train,cal);
 if(!model||model.trainingRows!==existing.trainingRows||model.calibrationRows!==existing.calibrationRows||model.trainedThrough!==existing.trainedThrough||model.calibratedThrough!==existing.calibratedThrough||model.model.coefficients.some((c,i)=>Math.abs(c-existing.model.coefficients[i])>1e-8))throw Error('Original quarter model does not reproduce '+existing.group);
 const sorted=model.residuals.sort((a,b)=>a-b),count=Math.min(801,sorted.length);
 quarter[existing.group]=Array.from({length:count},(_,i)=>Number(sorted[Math.round(i*(sorted.length-1)/(count-1))].toFixed(7)));
 console.log(existing.group,'train',train.length,'calibration',cal.length,'retained',count);
}
const manifest=JSON.parse(await readFile('model-runtime/quarter-manifest.json','utf8'));
await writeFile('model-runtime/nba-quarter-calibration.json',JSON.stringify({sourceSha256:manifest.sha256,residuals:quarter})+'\n');

const data=JSON.parse(gunzipSync(await readFile('model-runtime/snapshot.json.gz')));
const mainManifest=JSON.parse(await readFile('model-runtime/manifest.json','utf8'));
const {nbaCombinationHistory,NBA_COMBINATION_MARKETS}=await loadTs(new URL('../lib/nba-combination-history.ts',import.meta.url));
const {evaluateProbabilityModels}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const models=[],diagnostics={};
for(const market of Object.keys(NBA_COMBINATION_MARKETS)){
 const rows=nbaCombinationHistory(data.observations,market);
 const r=evaluateProbabilityModels(rows,[],{featurePolicy:'basketball_context',calibration:'workload',pointPolicy:'direct',participation:'played'});
 const d=r.reports[0];
 console.log(market,rows.length,d?.trainingRows,d?.calibrationRows,d?.forecasts,d?.mae,d?.baselineMae,d?.crps,d?.baselineCrps);
 if(!r.models.length||d.forecasts<100||d.crps>=d.baselineCrps)continue;
 models.push(...r.models);
 diagnostics[market]={eligibleLaterSeason:d.forecasts,mae:d.mae,baselineMae:d.baselineMae,crps:d.crps,baselineCrps:d.baselineCrps};
}
await writeFile('model-runtime/nba-combination-models.json',JSON.stringify({sourceSha256:mainManifest.sha256,models,diagnostics})+'\n');
