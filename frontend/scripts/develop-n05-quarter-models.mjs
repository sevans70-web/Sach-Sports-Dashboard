// Rebuild labels from the original official archive. Separate candidate research;
// no live model promotion, history edits, or source-selection by outcome.
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const archive=process.argv[2],output=process.argv[3];if(!archive||!output)throw Error('Archive directory and new output directory required');
await mkdir(output,{recursive:false});
const {basketballQuarterObservations}=await loadTs(new URL('../lib/basketball-quarter-observations.ts',import.meta.url));
const {quarterFeatureIndex,fitQuarterModel,quarterPoint}=await loadTs(new URL('../lib/quarter-forecast.ts',import.meta.url));
const digest=b=>createHash('sha256').update(b).digest('hex');
const sourceManifest=JSON.parse(await readFile(archive+'/manifest.json','utf8')),records=[],sources=[],errors=[];
const provenance=new Map(sourceManifest.sources.map(s=>[s.gameId,s]));
let done=0;
for(const name of (await readdir(archive+'/sources')).filter(n=>n.endsWith('.json.gz')).sort()){
 const id=name.replace('.json.gz',''),bytes=await readFile(archive+'/sources/'+name),raw=gunzipSync(bytes),source=provenance.get(id);
 if(!source||digest(raw)!==source.sha256)throw Error('Source provenance mismatch '+id);
 const p=JSON.parse(raw),rows=basketballQuarterObservations(p,id,source.url,source.retrievedAt);
 records.push(...rows);sources.push({gameId:id,sha256:source.sha256,observations:rows.length});if(!rows.length)errors.push({gameId:id,reason:'unreconciled_or_incomplete'});
 if(++done%300===0)console.log(JSON.stringify({done,observations:records.length}));
}
const nflPath='model-research/2026-10-19/nfl-quarter-population/',nflManifest=JSON.parse(await readFile(nflPath+'source-manifest.json','utf8')),nflBytes=await readFile(nflPath+'opportunity-observations.json.gz');
if(digest(nflBytes)!==nflManifest.compressedSha256)throw Error('NFL source hash mismatch');
records.push(...JSON.parse(gunzipSync(nflBytes)).map(g=>({...g,role:g.roleWorkload})));
records.sort((a,b)=>[a.gameTime,a.gameId,a.playerId,a.market].join('|').localeCompare([b.gameTime,b.gameId,b.playerId,b.market].join('|')));
const inputs=quarterFeatureIndex(records),reports=[],models=[],groups=[...new Set(records.map(g=>g.sport+'|'+g.market))].sort();
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
for(const group of groups){
 const games=records.filter(g=>g.sport+'|'+g.market===group),rows=games.flatMap(g=>{const f=inputs(g);return f.features?[{...g,features:f.features,baseline:f.baseline}]:[];});
 const prior=rows.filter(g=>Number(g.season)<2026),test=rows.filter(g=>g.season==='2026'),dates=[...new Set(prior.map(g=>g.gameTime))].sort(),boundary=dates[Math.floor(dates.length*.65)];
 const train=prior.filter(g=>Date.parse(g.gameTime)<Date.parse(boundary)-48*3600000),cal=prior.filter(g=>g.gameTime>=boundary),model=fitQuarterModel(group,train,cal);
 if(!model){reports.push({group,observations:games.length,trainingRows:train.length,calibrationRows:cal.length,status:'insufficient_fit'});continue;}
 if(test.some(g=>Date.parse(g.gameTime)-48*3600000<=Date.parse(model.calibratedThrough)))throw Error('Calibration/test overlap');
 const scored=test.map(g=>({...g,prediction:quarterPoint(model,g.features)}));
 const mae=mean(scored.map(g=>Math.abs(g.prediction-g.actual))),baselineMae=mean(scored.map(g=>Math.abs(g.baseline-g.actual))),mse=mean(scored.map(g=>(g.prediction-g.actual)**2)),baselineMse=mean(scored.map(g=>(g.baseline-g.actual)**2));
 const report={group,observations:games.length,trainingRows:train.length,calibrationRows:cal.length,testRows:scored.length,testFixtures:new Set(test.map(g=>g.gameId)).size,mae,baselineMae,rmse:mse==null?null:Math.sqrt(mse),baselineRmse:baselineMse==null?null:Math.sqrt(baselineMse),bias:mean(scored.map(g=>g.prediction-g.actual)),zeroQuarterRows:games.filter(g=>g.actual===0).length,pointErrorImproved:mse!=null&&baselineMse!=null&&mse<baselineMse,validatedForBetting:false};
 reports.push(report);models.push(model);console.log(JSON.stringify(report));
}
const bytes=gzipSync(JSON.stringify({version:1,models,observations:records})+'\n',{level:9});
await writeFile(output+'/quarter-candidates.json.gz',bytes);
await writeFile(output+'/evaluation.json',JSON.stringify({createdAt:new Date().toISOString(),model:'direct-quarter-history-ridge-v1',candidateSha256:digest(bytes),nbaSourceManifestSha256:digest(JSON.stringify(sourceManifest)),nflSourceSha256:nflManifest.compressedSha256,observations:records.length,reports,excludedNbaFixtures:errors.length,limitations:['2026 is a development evaluation already used in prior research, not a new untouched holdout.','Quarter participation and price/void rules are not betting eligibility. No betting approval or profitable edge is claimed.','Features use only previous same-team quarter observations and historical role, with 48-hour exclusion. No full-game/4 projection or target workload is used.','Raw source revisions are observed later; historical pregame injury/rotation vintages are unavailable.'],sources,errors},null,2)+'\n');
