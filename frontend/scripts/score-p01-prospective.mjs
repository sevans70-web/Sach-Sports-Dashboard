import{execFileSync}from'node:child_process';import{fileURLToPath}from'node:url';
import{confidenceSummary}from'./p01-confidence-summary.mjs';
import{researchOfficialResults,officialResult,writeResearchReport,readResearchCohort}from'./p01-official-results.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {loadTs} from '../tests/load-ts.mjs';
const [source,output,officialDirectory]=process.argv.slice(2);if(!source||!output||resolve(source)===resolve(output))throw Error('Provide frozen cohort and NEW output directory');
execFileSync(process.execPath,[fileURLToPath(new URL('./verify-p01-football.mjs',import.meta.url)),source],{stdio:'pipe'});
const hash=b=>createHash('sha256').update(b).digest('hex'),raw=await readResearchCohort(source),receipt=JSON.parse(await readFile(source+'/receipt.json','utf8'));assert.equal(hash(raw),receipt.sha256);const cohort=JSON.parse(raw),now=Date.now();
if(cohort.protocol.study!=='p01-prospective-matchup-v1'||cohort.decisions.length!==receipt.decisions)throw Error('Invalid frozen cohort');
for(const d of cohort.decisions){
 for(const policy of ['baseline','candidate']){const {sha256,...r}=d[policy].inputReceipt;assert.equal(hash(JSON.stringify(r)),sha256);assert.equal(r.decisionAt,d.quote.decisionAt);assert.equal(r.snapshotSha256,policy==='baseline'?cohort.protocol.runtimeSha256:cohort.protocol.candidateSha256);}
 if(Date.parse(cohort.completedAt)>=Date.parse(d.target.gameTime)||Date.parse(d.quote.decisionAt)>=Date.parse(d.target.gameTime))throw Error('Capture was not pregame');
}
const {footballObservedRows}=await loadTs(new URL('../lib/football-observed-stats.ts',import.meta.url)),{clusteredMeanInterval,quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const {researchFootballOutcome:resolveOutcome}=await loadTs(new URL('../lib/research-football-outcome.ts',import.meta.url));
const archive=await researchOfficialResults(officialDirectory);
const finals=new Map(),requests=[],unresolved=[],decisions=[];
for(const id of new Set(cohort.decisions.filter(d=>Date.parse(d.target.gameTime)<now).map(d=>d.target.gameId))){
 const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+encodeURIComponent(id);
 const record=await officialResult(id,url,archive);requests.push(record);if(record.data)finals.set(id,{payload:record.data,rows:footballObservedRows(record.data)});
}
for(const d of cohort.decisions){
 const issue=quoteProblem(d.quote,d.target);if(issue)throw Error('Invalid frozen quote: '+issue);
 const f=finals.get(d.target.gameId),observed=f?resolveOutcome(f.payload,d.target,f.rows):{status:'pending',reason:Date.parse(d.target.gameTime)>=now?'upcoming':'official_final_unavailable'};
 if(observed.status!=='observed'){unresolved.push({target:d.target,...observed});continue;}
 const actual=observed.actual;
 const push=actual===d.quote.line,outcome=Number(actual>d.quote.line),result={target:d.target,quote:d.quote,actual,push};
 for(const policy of ['baseline','candidate']){const p=d[policy].price,total=p.over+p.under,over=total>0?p.over/total:null,side=p.candidateSide,won=push?null:side==='OVER'?outcome===1:side==='UNDER'?outcome===0:null,odds=side==='OVER'?d.quote.overPrice:d.quote.underPrice;
  const direction=over==null||over===.5?null:over>.5?'OVER':'UNDER';
  result[policy]={direction,directionWon:push||!direction?null:direction==='OVER'?outcome===1:outcome===0,over,brier:!push&&over!=null?(over-outcome)**2:null,side,won,profit:side?push?0:won?(odds>0?odds/100:100/-odds):-1:null};
 }result.bookBrier=push?null:(d.baseline.price.marketOver-outcome)**2;decisions.push(result);
}
const average=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const reports=[...new Set(cohort.decisions.map(d=>d.target.market))].map(market=>{
 const all=decisions.filter(d=>d.target.market===market),settled=all.filter(d=>!d.push),paired=settled.filter(d=>Number.isFinite(d.baseline.brier)&&Number.isFinite(d.candidate.brier));
 const sides=policy=>['OVER','UNDER'].map(side=>{const rs=all.filter(d=>d[policy].side===side);return {side,selected:rs.length,settled:rs.filter(d=>!d.push).length,pushes:rs.filter(d=>d.push).length,hits:rs.filter(d=>d[policy].won===true).length,unitRoi:average(rs.map(d=>d[policy].profit)),roiInterval:clusteredMeanInterval(rs.map(d=>({gameId:d.target.gameId,value:d[policy].profit})))}});
 return {market,settled:settled.length,pushes:all.length-settled.length,independentGames:new Set(settled.map(d=>d.target.gameId)).size,pairedBrierSamples:paired.length,unscorableConditionalBrier:settled.length-paired.length,baselineBrier:average(paired.map(d=>d.baseline.brier)),candidateBrier:average(paired.map(d=>d.candidate.brier)),bookBrier:average(settled.map(d=>d.bookBrier)),pairedBrierImprovement:clusteredMeanInterval(paired.map(d=>({gameId:d.target.gameId,value:d.baseline.brier-d.candidate.brier}))),pairedBookImprovement:clusteredMeanInterval(paired.map(d=>({gameId:d.target.gameId,value:d.bookBrier-d.candidate.brier}))),confidence:Object.fromEntries(['baseline','candidate'].map(policy=>[policy,confidenceSummary(all,policy)])),pairedDirectionImprovement:clusteredMeanInterval(settled.filter(d=>typeof d.baseline.directionWon==='boolean'&&typeof d.candidate.directionWon==='boolean').map(d=>({gameId:d.target.gameId,value:Number(d.candidate.directionWon)-Number(d.baseline.directionWon)}))),baselineSides:sides('baseline'),candidateSides:sides('candidate')};
});
await mkdir(output,{recursive:false});const report={cohortSha256:receipt.sha256,scoredAt:new Date().toISOString(),selected:cohort.decisions.length,resolved:decisions.length,pending:unresolved.filter(r=>r.status==='pending').length,voids:unresolved.filter(r=>r.status==='void').length,unresolved:unresolved.filter(r=>r.status==='unresolved').length,complete:cohort.decisions.length>0&&unresolved.every(r=>r.status==='void'),reports,excludedOrPending:unresolved,decisions,requests,validatedForBetting:false,livePromotion:false};await writeResearchReport(output,report);console.log(JSON.stringify({selected:report.selected,resolved:report.resolved,pending:report.pending,complete:report.complete,reports},null,2));
