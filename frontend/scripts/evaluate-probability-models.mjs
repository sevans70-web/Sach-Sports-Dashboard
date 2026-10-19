import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {loadTs} from '../tests/load-ts.mjs';
const source=(process.env.MODEL_OBSERVATIONS_DIR||new URL('../model-research/2026-10-18/',import.meta.url).pathname).replace(/\/$/,'')+'/';
const output=process.argv[2]||new URL('../model-research/2026-10-19/',import.meta.url).pathname;
const digest=b=>createHash('sha256').update(b).digest('hex');
const manifest=JSON.parse(await readFile(source+'source-manifest.json','utf8'));
const compressed=await readFile(source+'opportunity-observations.json.gz');
assert.equal(digest(compressed),manifest.compressedSha256);
const raw=gunzipSync(compressed);assert.equal(digest(raw),manifest.dataSha256);
const quotes=process.argv[3]?JSON.parse(await readFile(process.argv[3],'utf8')):[];
const {evaluateProbabilityModels}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const {models,...report}=evaluateProbabilityModels(JSON.parse(raw),quotes);
const artifacts=gzipSync(JSON.stringify(models)+'\n',{level:9});
const result={...report,sourceDataSha256:manifest.dataSha256,selectedQuoteCount:quotes.length,
 quoteDataSha256:quotes.length?digest(JSON.stringify(quotes)):null,modelArtifactsSha256:digest(artifacts)};
if(process.env.MODEL_VERIFY==='1'){
 assert.equal(digest(await readFile(output+'/distribution-models.json.gz')),result.modelArtifactsSha256,'Fitted artifact digest mismatch');
 assert.deepEqual(JSON.parse(await readFile(output+'/probability-evaluation.json','utf8')),result,'Probability evaluation replay changed');
}else{
 await mkdir(output,{recursive:true});
 await writeFile(output+'/distribution-models.json.gz',artifacts);
 await writeFile(output+'/probability-evaluation.json',JSON.stringify(result,null,2)+'\n');
}
console.log(JSON.stringify({observations:report.observations,models:models.length,giEnabled:report.giEnabled,
 groups:report.reports.map(({group,trainingRows,calibrationRows,forecasts,mae,baselineMae,crps,interval80Coverage,exactQuoteSamples,reason})=>({group,trainingRows,calibrationRows,forecasts,mae,baselineMae,crps,interval80Coverage,exactQuoteSamples,reason}))},null,2));
