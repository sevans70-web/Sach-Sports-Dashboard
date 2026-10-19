import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';
import {loadTs} from '../tests/load-ts.mjs';
const root=process.argv[2];if(!root)throw Error('Explicit output directory required');
const source=new URL('../model-research/2026-10-19/nfl-saved-quotes/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('source-manifest.json',source),'utf8'));
const compressed=await readFile(new URL('opportunity-observations.json.gz',source)),raw=gunzipSync(compressed);
const hash=b=>createHash('sha256').update(b).digest('hex');assert.equal(hash(raw),manifest.dataSha256);assert.equal(hash(compressed),manifest.compressedSha256);
const observations=JSON.parse(raw),quotes=JSON.parse(await readFile(new URL('selected-quotes.json',source),'utf8'));
const models=JSON.parse(gunzipSync(await readFile(new URL('distribution-models.json.gz',source))));
const {forecastDistribution}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const {giCalibrationRow,fitOpportunityStrength}=await loadTs(new URL('../lib/opportunity-strength.ts',import.meta.url));
const rejected={},rows=[];for(const q of quotes){
 const target=observations.find(g=>g.sport===q.sport&&g.market===q.market&&g.playerId===q.playerId&&g.gameId===q.gameId),model=models.find(m=>m.group===q.sport+'|'+q.market);
 if(!target||!model){rejected.missing_model_or_result=(rejected.missing_model_or_result||0)+1;continue}
 const f=forecastDistribution(model,observations,target,q.decisionAt);
 if(!f.forecast){rejected[f.reason]=(rejected[f.reason]||0)+1;continue}
 const r=giCalibrationRow(target,q,f.forecast.values,target.retrievedAt);
 if(!r){rejected.quote_or_settlement_unverified=(rejected.quote_or_settlement_unverified||0)+1;continue}rows.push(r);
}
const evaluatedAt=new Date().toISOString(),result=fitOpportunityStrength(rows,evaluatedAt);
const report={modelId:'opportunity-strength-empirical-return-candidate-v1',evaluatedAt,sourceDataSha256:manifest.dataSha256,selectedQuotes:quotes.length,
 eligibleCalibrationRows:rows.length,fixtures:new Set(rows.map(r=>r.gameId)).size,minimumCalibrationRows:200,minimumFixtures:30,
 rejectionCounts:rejected,fitReason:result.reason,giEnabled:false,publicPicksEnabled:false,
 artifact:result.artifact,limitations:['GI represents ranked calibrated expected unit return, not outcome probability or evidence confidence.',
 'These are retrospective exact-price diagnostic decisions; independent later evaluation and complete current context are still required.',
 'Quoted payout arithmetic does not implement every bookmaker participation/refund rule.',
 'NBA has no independently verified historical exact-price samples in the current dataset; its six fitted distributions cannot establish betting accuracy.']};
await mkdir(root,{recursive:true});await writeFile(root+'/opportunity-strength-evaluation.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
