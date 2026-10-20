import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {loadTs} from '../tests/load-ts.mjs';
const source=process.argv[2],output=process.argv[3];if(!source||!output||source===output)throw Error('Separate explicit source and output required');
const {forecastDistribution,evaluatePrice,clusteredMeanInterval}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const {giCalibrationRow,fitOpportunityStrength,opportunityStrength}=await loadTs(new URL('../lib/opportunity-strength.ts',import.meta.url));
const manifest=JSON.parse(await readFile(source+'/source-manifest.json','utf8'));
const compressed=await readFile(source+'/opportunity-observations.json.gz'),raw=gunzipSync(compressed);
const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(raw),manifest.dataSha256);assert.equal(hash(compressed),manifest.compressedSha256);
const observations=JSON.parse(raw),quotes=JSON.parse(await readFile(source+'/selected-quotes.json','utf8'));
const sport=manifest.sport,modelSource=new URL('../model-research/2026-10-19/'+(sport==='nfl'?'nfl-population':'nba-context-model')+'/distribution-models.json.gz',import.meta.url);
const models=JSON.parse(gunzipSync(await readFile(modelSource)));
const cutoff=sport==='nfl'?'2026-10-16T00:00:00Z':'2026-04-05T00:00:00Z';
const rejected={},calibration=[],later=[];const reject=r=>rejected[r]=(rejected[r]||0)+1;
for(const q of quotes){
 const target=observations.find(g=>g.sport===q.sport&&g.market===q.market&&g.playerId===q.playerId&&g.gameId===q.gameId),model=models.find(m=>m.group===q.sport+'|'+q.market);
 if(!target||!model){reject('missing_model_or_official_result');continue}
 const f=forecastDistribution(model,observations,target,q.decisionAt);if(!f.forecast){reject(f.reason);continue}
 // The same declared 48h source-availability convention used for forecast
 // features. This is a retrospective simulation, not historical publication proof.
 const settledAt=new Date(Date.parse(target.gameTime)+48*3600000).toISOString();
 const row=giCalibrationRow(target,q,f.forecast.values,settledAt);if(!row){reject('invalid_quote_or_result');continue}
 const price=evaluatePrice(f.forecast.values,q);
 const detail={...row,market:q.market,projection:f.forecast.projection,actual:target.actual,line:q.line,modelOver:price.over,bookOver:price.marketOver,push:target.actual===q.line};
 if(Date.parse(settledAt)<Date.parse(cutoff))calibration.push(row);
 else if(Date.parse(q.decisionAt)>Date.parse(cutoff))later.push(detail);
 else reject('split_boundary');
}
const fit=fitOpportunityStrength(calibration,cutoff);
const scored=later.map(r=>({...r,gi:fit.artifact?opportunityStrength(fit.artifact,r.expectedReturn,r.decisionAt):null}));
const groups=[...new Set(scored.map(r=>r.market))].map(market=>{
 const rows=scored.filter(r=>r.market===market),decided=rows.filter(r=>!r.push),positive=rows.filter(r=>r.gi?.estimatedUnitReturn>0);
 const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
 return {market,forecasts:rows.length,fixtures:new Set(rows.map(r=>r.gameId)).size,
  modelBrier:mean(decided.map(r=>(r.modelOver-(r.actual>r.line?1:0))**2)),
  bookBrier:mean(decided.map(r=>(r.bookOver-(r.actual>r.line?1:0))**2)),
  modelMae:mean(rows.map(r=>Math.abs(r.projection-r.actual))),positiveGiOpportunities:positive.length,
  positiveGiMeanUnitReturn:mean(positive.map(r=>r.unitReturn)),
 };
});
const report={modelId:'rookie-exact-price-gi-evaluation-v1',evaluatedAt:new Date().toISOString(),sport,cutoff,
 quotes:quotes.length,calibrationRows:calibration.length,calibrationFixtures:new Set(calibration.map(r=>r.gameId)).size,
 laterForecasts:later.length,laterFixtures:new Set(later.map(r=>r.gameId)).size,fitReason:fit.reason,
 artifact:fit.artifact,groups,rejected,giEnabled:false,publicPicksEnabled:false,
 sourceDataSha256:manifest.dataSha256,quoteDataSha256:hash(JSON.stringify(quotes)),
 limitations:[...manifest.limitations,'Fixed models are reused without refitting against the newly collected prices.','The 48-hour settlement-availability convention is not a recovered provider publication timestamp.','Calibration and later evaluation are chronological, with all boundary-overlap opportunities excluded.','October 18 outcomes overlap earlier development inspections; this is not a fresh, untouched holdout.','This does not establish complete current role, injury or rotation evidence, prospective performance, bookmaker refund rules or public model approval.']};
await mkdir(output,{recursive:true});await writeFile(output+'/opportunity-strength-evaluation.json',JSON.stringify(report,null,2)+'\n');
await writeFile(output+'/forecast-decisions.json',JSON.stringify(scored,null,2)+'\n');
console.log(JSON.stringify({...report,artifact:fit.artifact?{rows:fit.artifact.calibrationRows,fixtures:fit.artifact.fixtures,blocks:fit.artifact.blocks.length}:null},null,2));
