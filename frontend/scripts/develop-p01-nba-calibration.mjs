import {readFile,writeFile,mkdir}from'node:fs/promises';import{createHash}from'node:crypto';import{loadTs}from'../tests/load-ts.mjs';
const [audit,out]=process.argv.slice(2);if(!audit||!out)throw Error('Provide frozen audit and NEW output directory');
const hash=x=>createHash('sha256').update(x).digest('hex'),json=x=>JSON.stringify(x,null,2)+'\n';
const receipt=JSON.parse(await readFile(audit+'/receipt.json'));for(const [f,sha]of Object.entries(receipt.files))if(hash(await readFile(audit+'/'+f))!==sha)throw Error('Audit checksum mismatch '+f);
const report=JSON.parse(await readFile(audit+'/accuracy-audit.json'));
await mkdir(out,{recursive:false});
const protocol={createdAt:new Date().toISOString(),study:'P01 NBA conditional probability recalibration research',selection:'Every independently resolved original saved numeric NBA main-market probability in the frozen audit; no confidence, side or hit/miss filtering. Pushes excluded from binary calibration.',development:'Earliest60% of exact fixtures for training;latest40% for chronological diagnostic. All markets from one fixture stay in one partition. Earlier outcomes and this audit were already inspected: this is retrospective development, NOT untouched validation.',candidate:'Per-market monotone logistic calibration:intercept0/slope1 initial;2000 gradient steps at0.1;ridge1 toward identity;slope bounded0..5;minimum30 training records. Fixed settings, no holdout tuning. Final candidate fit to all available resolved records only for a later prospective cohort.',benchmark:'Original conditional OVER probability and constant0.5. No two-sided prices available: no no-vig book,EV or ROI claim.',livePromotion:false};
await writeFile(out+'/protocol.json',json(protocol));
const {fitResearchCalibration:fit,researchCalibratedProbability:apply}=await loadTs(new URL('../lib/research-probability-calibration.ts',import.meta.url));
const rows=report.decisions.filter(r=>r.brier!=null).map(r=>({...r,p:r.probability.side==='OVER'?r.conditional:1-r.conditional,y:Number(r.actual>r.line)}));
const fixtures=[...new Map(rows.map(r=>[r.gameId,r.gameTime])).entries()].sort((a,b)=>Date.parse(a[1])-Date.parse(b[1])||a[0].localeCompare(b[0])),split=Math.floor(fixtures.length*.6),trainIds=new Set(fixtures.slice(0,split).map(([id])=>id));
const models={},diagnostics=[],testRows=[];
for(const market of [...new Set(rows.map(r=>r.market))]){
 const all=rows.filter(r=>r.market===market),train=all.filter(r=>trainIds.has(r.gameId)),test=all.filter(r=>!trainIds.has(r.gameId)),model=fit(train);
 const paired=model?test.map(r=>({...r,candidateOver:apply(model,r.p)})):[];testRows.push(...paired);
 diagnostics.push({market,training:train.length,test:test.length,supported:!!model,originalBrier:paired.length?paired.reduce((a,r)=>a+(r.p-r.y)**2,0)/paired.length:null,candidateBrier:paired.length?paired.reduce((a,r)=>a+(r.candidateOver-r.y)**2,0)/paired.length:null});models[market]=fit(all);
}
const mean=(rs,k)=>rs.length?rs.reduce((a,r)=>a+(r[k]-r.y)**2,0)/rs.length:null;
const results={auditSha256:receipt.files['accuracy-audit.json'],protocol,trainingFixtures:split,diagnosticFixtures:fixtures.length-split,trainingFixtureIds:[...trainIds],diagnosticFixtureIds:fixtures.slice(split).map(([id])=>id),paired:testRows.length,originalBrier:mean(testRows,'p'),candidateBrier:mean(testRows,'candidateOver'),groups:diagnostics,testRows,validatedForBetting:false};
await writeFile(out+'/candidate-models.json',json({protocol,models}));await writeFile(out+'/development-report.json',json(results));await writeFile(out+'/receipt.json',json({createdAt:new Date().toISOString(),candidateSha256:hash(await readFile(out+'/candidate-models.json')),reportSha256:hash(await readFile(out+'/development-report.json'))}));
console.log(json({paired:results.paired,trainingFixtures:split,testFixtures:fixtures.length-split,originalBrier:results.originalBrier,candidateBrier:results.candidateBrier,groups:diagnostics,livePromotion:false}));
