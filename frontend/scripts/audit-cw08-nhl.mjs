// Read-only, reproducible CW08 diagnostics. No provider requests or history writes.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const {probabilityInputs,predictLinear,distributionValues,outcomeProbabilities}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const {nhlCountProbabilities,NHL_COUNT_POLICY}=await loadTs(new URL('../lib/nhl-count-model.ts',import.meta.url));
const hash=x=>createHash('sha256').update(x).digest('hex');
const raw=await readFile('model-research/2026-10-18/opportunity-observations.json.gz');
const bytes=await readFile('model-runtime/snapshot.json.gz');
const manifest=JSON.parse(await readFile('model-runtime/manifest.json','utf8'));
assert.equal(hash(bytes),manifest.sha256);
const source=JSON.parse(gunzipSync(raw)),runtime=JSON.parse(gunzipSync(bytes));
const savedBytes=await readFile('model-research/cw08-nhl/saved-picks-audit.json');
const saved=JSON.parse(savedBytes).rows;
const average=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const reports=[];
for(const market of ['goals','assists']){
 const model=runtime.models.find(m=>m.group==='nhl|'+market);
 const history=source.filter(g=>g.sport==='nhl'&&g.market===market);
 const histories=new Map();
 for(const g of history){const key=[g.playerId,g.teamId,g.season].join('|');histories.set(key,[...(histories.get(key)||[]),g]);}
 const rows=history.flatMap(g=>{
  const input=probabilityInputs(histories.get([g.playerId,g.teamId,g.season].join('|')),g);
  if(!input.features)return [];
  const mu=Math.max(0,predictLinear(model.workload,input.features)*predictLinear(model.rate,input.features));
  return [{...g,mu}];
 });
 const calibration=rows.filter(g=>g.gameTime>model.trainedThrough&&g.gameTime<=model.calibratedThrough);
 assert.equal(calibration.length,model.calibrationRows);
 const errors=calibration.map(g=>g.actual-g.mu).sort((a,b)=>a-b);
 errors.forEach((e,i)=>assert.ok(Math.abs(e-model.residuals[i])<1e-12,'reconstruct original calibration'));
 const test=rows.filter(g=>g.season==='20252026');
 assert.ok(test.every(g=>Date.parse(g.gameTime)-48*3600000>Date.parse(model.calibratedThrough)));
 const results=test.map(g=>({y:Number(g.actual>.5),old:outcomeProbabilities(distributionValues(model,g.mu),.5).over,candidate:nhlCountProbabilities(g.mu,.5).over,mu:g.mu,actual:g.actual,gameId:g.gameId}));
 const brier=key=>average(results.map(g=>(g[key]-g.y)**2));
 const oldBrier=brier('old'),candidateBrier=brier('candidate');
 const picks=saved.filter(r=>r.market===market);
 const withProbability=picks.filter(r=>r.probabilities);
 reports.push({market,trainingRows:model.trainingRows,calibrationRows:model.calibrationRows,calibrationPlayers:new Set(calibration.map(g=>g.playerId)).size,
  trainedThrough:model.trainedThrough,calibratedThrough:model.calibratedThrough,evaluationRows:results.length,evaluationFixtures:new Set(results.map(g=>g.gameId)).size,
  projectionMean:average(results.map(g=>g.mu)),actualMean:average(results.map(g=>g.actual)),observedOverRate:average(results.map(g=>g.y)),legacyMeanOverProbability:average(results.map(g=>g.old)),candidateMeanOverProbability:average(results.map(g=>g.candidate)),
  legacyBrier:oldBrier,candidateBrier,brierChange:candidateBrier-oldBrier,accuracyRegressionPassed:candidateBrier<=oldBrier,
  exactPriceValidationPassed:false,selectionApproved:false,
  saved:{picks:picks.length,under:picks.filter(r=>r.prediction_side==='UNDER').length,over:picks.filter(r=>r.prediction_side==='OVER').length,
   firstDay:picks[0]?.game_date,lastDay:picks.at(-1)?.game_date,probabilityReceipts:withProbability.length,missingProbabilityReceipts:picks.length-withProbability.length,
   savedOverProbabilities:[...new Set(withProbability.map(r=>r.probabilities.overProbability))],
   underMeanAboveLine:picks.filter(r=>r.prediction_side==='UNDER'&&Number(r.projection)>Number(r.sportsbook_line)).length,
   hits:picks.filter(r=>r.result_status==='hit').length,misses:picks.filter(r=>r.result_status==='miss').length}});
}
const report={task:'CW08',candidate:NHL_COUNT_POLICY,sourceSha256:hash(raw),runtimeSha256:hash(bytes),savedAuditSha256:hash(savedBytes),
 protocol:{evaluationSeason:'20252026',line:.5,refit:false,historyWrites:false,source:'existing selected-player archived cohort',
  limitations:['Previously inspected season is a regression set, not a fresh holdout.','Only ten skaters in the original source cohort; population and exact-price validation are missing.','Saved November means are rounded and most probability receipts are absent; exact historical recalculation is not claimed.','A lower Brier score alone would not approve betting selections.']},reports,
 selectionApproved:false,blocker:'Both count candidates regress on archived-season Brier; new selections and old GI reuse are withheld pending count calibration and exact-price validation.'};
await writeFile('model-research/cw08-nhl/regression-report.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--require-approval')&&!reports.every(r=>r.accuracyRegressionPassed&&r.exactPriceValidationPassed))process.exitCode=1;
