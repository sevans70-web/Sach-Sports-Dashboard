// Diagnostic only: earlier prior-season rows choose projection policy;
// later disjoint prior-season rows calibrate errors. No runtime writes.
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {loadTs} from '../tests/load-ts.mjs';
const {probabilityInputs,predictLinear,distributionValues,evaluatePrice,quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const root=new URL('../model-research/2026-10-19/nfl-saved-quotes/',import.meta.url);
const games=JSON.parse(gunzipSync(await readFile(new URL('opportunity-observations.json.gz',root)))),models=JSON.parse(gunzipSync(await readFile(new URL('distribution-models.json.gz',root)))),quotes=JSON.parse(await readFile(new URL('selected-quotes.json',root),'utf8'));
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null,report=[];
for(const model of models){
 const history=games.filter(g=>g.sport+'|'+g.market===model.group);
 const rows=history.flatMap(g=>{const f=probabilityInputs(history,g,g.gameTime);if(!f.features)return [];const raw=Math.max(0,predictLinear(model.workload,f.features))*predictLinear(model.rate,f.features);return [{g,baseline:f.baseline,projection:model.minimum==null?raw:Math.max(model.minimum,raw)}]});
 const calibration=rows.filter(r=>r.g.season<'2026'&&Date.parse(r.g.gameTime)>Date.parse(model.trainedThrough)+48*3600000).sort((a,b)=>a.g.gameTime.localeCompare(b.g.gameTime));
 const dates=[...new Set(calibration.map(r=>r.g.gameTime))].sort(),boundary=dates[Math.floor(dates.length*.3)];
 const choose=calibration.filter(r=>r.g.gameTime<boundary),calibrate=calibration.filter(r=>r.g.gameTime>=boundary);
 if(choose.length<30||calibrate.length<100){report.push({group:model.group,reason:'insufficient_disjoint_calibration',selectionRows:choose.length,residualRows:calibrate.length});continue;}
 const selectionMae={model:mean(choose.map(r=>Math.abs(r.projection-r.g.actual))),baseline:mean(choose.map(r=>Math.abs(r.baseline-r.g.actual)))};
 const policy=selectionMae.baseline<selectionMae.model?'baseline':'projection',residuals=calibrate.map(r=>r.g.actual-r[policy]),tests=rows.filter(r=>r.g.season==='2026'),priced=[];
 for(const r of tests){const q=quotes.find(q=>q.sport===r.g.sport&&q.market===r.g.market&&q.playerId===r.g.playerId&&q.gameId===r.g.gameId);if(!q||quoteProblem(q,r.g)||r.g.actual===q.line)continue;
 const input=probabilityInputs(history,r.g,q.decisionAt);if(!input.features)continue;
 const raw=Math.max(0,predictLinear(model.workload,input.features))*predictLinear(model.rate,input.features),projection=model.minimum==null?raw:Math.max(model.minimum,raw),candidate=policy==='baseline'?input.baseline:projection;
 const old=evaluatePrice(distributionValues(model,projection),q),next=evaluatePrice(distributionValues({...model,residuals},candidate),q),outcome=Number(r.g.actual>q.line);
 priced.push({old:(old.over/(old.over+old.under)-outcome)**2,next:(next.over/(next.over+next.under)-outcome)**2,book:(old.marketOver-outcome)**2});}
 report.push({group:model.group,selectionRows:choose.length,residualRows:calibrate.length,selectionMae,policy,testRows:tests.length,oldMae:mean(tests.map(r=>Math.abs(r.projection-r.g.actual))),candidateMae:mean(tests.map(r=>Math.abs(r[policy]-r.g.actual))),exactQuotes:priced.length,oldBrier:mean(priced.map(r=>r.old)),candidateBrier:mean(priced.map(r=>r.next)),bookBrier:mean(priced.map(r=>r.book)),validatedForBetting:false});
}
console.log(JSON.stringify({purpose:'diagnostic_reused_development_data_not_untouched_holdout',runtimeChanged:false,report},null,2));
