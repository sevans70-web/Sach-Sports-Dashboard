import {readFile,writeFile,mkdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';import assert from 'node:assert/strict';import {loadTs} from '../tests/load-ts.mjs';
const [source,output]=process.argv.slice(2);if(!source||!output||resolve(source)===resolve(output))throw Error('Provide frozen cohort and NEW output directory');
const hash=b=>createHash('sha256').update(b).digest('hex'),raw=await readFile(source+'/cohort.json'),receipt=JSON.parse(await readFile(source+'/receipt.json','utf8'));assert.equal(hash(raw),receipt.sha256);const cohort=JSON.parse(raw),now=Date.now();
if(cohort.protocol.study!=='p01-prospective-matchup-v1'||cohort.decisions.length!==receipt.decisions)throw Error('Invalid frozen cohort');
for(const d of cohort.decisions){
 for(const policy of ['baseline','candidate']){const {sha256,...r}=d[policy].inputReceipt;assert.equal(hash(JSON.stringify(r)),sha256);assert.equal(r.decisionAt,d.quote.decisionAt);assert.equal(r.snapshotSha256,policy==='baseline'?cohort.protocol.runtimeSha256:cohort.protocol.candidateSha256);}
 if(Date.parse(cohort.completedAt)>=Date.parse(d.target.gameTime)||Date.parse(d.quote.decisionAt)>=Date.parse(d.target.gameTime))throw Error('Capture was not pregame');
}
const {footballObservedRows}=await loadTs(new URL('../lib/football-observed-stats.ts',import.meta.url)),{clusteredMeanInterval,quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const finals=new Map(),requests=[],unresolved=[],decisions=[];
for(const id of new Set(cohort.decisions.filter(d=>Date.parse(d.target.gameTime)<now).map(d=>d.target.gameId))){
 const url='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event='+encodeURIComponent(id);
 try{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json();if(String(data.header?.id)!==id||data.header?.competitions?.[0]?.status?.type?.completed!==true){requests.push({id,url,status:'pending_official_final'});continue;}finals.set(id,footballObservedRows(data));requests.push({id,url,retrievedAt:new Date().toISOString(),sha256:hash(JSON.stringify(data)),data});}catch(e){requests.push({id,url,error:e.message});}
}
for(const d of cohort.decisions){
 const issue=quoteProblem(d.quote,d.target);if(issue)throw Error('Invalid frozen quote: '+issue);
 const actual=finals.get(d.target.gameId)?.find(r=>r.playerId===d.target.playerId)?.stats[d.target.market];
 if(actual==null||!Number.isFinite(actual)){unresolved.push({target:d.target,reason:Date.parse(d.target.gameTime)>=now?'upcoming':'official_final_or_stat_unavailable'});continue;}
 const push=actual===d.quote.line,outcome=Number(actual>d.quote.line),result={target:d.target,quote:d.quote,actual,push};
 for(const policy of ['baseline','candidate']){const p=d[policy].price,total=p.over+p.under,over=total>0?p.over/total:null,side=p.candidateSide,won=push?null:side==='OVER'?outcome===1:side==='UNDER'?outcome===0:null,odds=side==='OVER'?d.quote.overPrice:d.quote.underPrice;
  result[policy]={over,brier:!push&&over!=null?(over-outcome)**2:null,side,won,profit:side?push?0:won?(odds>0?odds/100:100/-odds):-1:null};
 }result.bookBrier=push?null:(d.baseline.price.marketOver-outcome)**2;decisions.push(result);
}
const average=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const reports=[...new Set(cohort.decisions.map(d=>d.target.market))].map(market=>{
 const all=decisions.filter(d=>d.target.market===market),settled=all.filter(d=>!d.push);
 const sides=policy=>['OVER','UNDER'].map(side=>{const rs=all.filter(d=>d[policy].side===side);return {side,selected:rs.length,settled:rs.filter(d=>!d.push).length,pushes:rs.filter(d=>d.push).length,hits:rs.filter(d=>d[policy].won===true).length,unitRoi:average(rs.map(d=>d[policy].profit)),roiInterval:clusteredMeanInterval(rs.map(d=>({gameId:d.target.gameId,value:d[policy].profit})))}});
 return {market,settled:settled.length,pushes:all.length-settled.length,independentGames:new Set(settled.map(d=>d.target.gameId)).size,baselineBrier:average(settled.map(d=>d.baseline.brier)),candidateBrier:average(settled.map(d=>d.candidate.brier)),bookBrier:average(settled.map(d=>d.bookBrier)),pairedBrierImprovement:clusteredMeanInterval(settled.map(d=>({gameId:d.target.gameId,value:d.baseline.brier-d.candidate.brier}))),pairedBookImprovement:clusteredMeanInterval(settled.map(d=>({gameId:d.target.gameId,value:d.bookBrier-d.candidate.brier}))),baselineSides:sides('baseline'),candidateSides:sides('candidate')};
});
await mkdir(output,{recursive:false});const report={cohortSha256:receipt.sha256,scoredAt:new Date().toISOString(),selected:cohort.decisions.length,resolved:decisions.length,pending:unresolved.length,complete:cohort.decisions.length>0&&unresolved.length===0,reports,unresolved,decisions,requests,validatedForBetting:false,livePromotion:false};await writeFile(output+'/report.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({selected:report.selected,resolved:report.resolved,pending:report.pending,complete:report.complete,reports},null,2));
