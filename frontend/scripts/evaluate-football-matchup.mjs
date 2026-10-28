import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {resolve} from 'node:path';import {loadTs} from '../tests/load-ts.mjs';
const [source,output]=process.argv.slice(2);if(!source||!output||resolve(source)===resolve(output))throw Error('Provide frozen source and separate new output directory');
const hash=b=>createHash('sha256').update(b).digest('hex'),manifest=JSON.parse(await readFile(source+'/source-manifest.json','utf8')),zip=await readFile(source+'/opportunity-observations.json.gz');assert.equal(hash(zip),manifest.compressedSha256);const raw=gunzipSync(zip);assert.equal(hash(raw),manifest.dataSha256);
const games=JSON.parse(raw),quotes=JSON.parse(await readFile(source+'/selected-quotes.json','utf8'));
if(games.some(g=>!['nfl','cfb'].includes(g.sport)))throw Error('Football population required');
// Directory creation is exclusive: never rewrite previous research receipts.
await mkdir(output,{recursive:false});
const protocol={createdAt:new Date().toISOString(),candidate:'football-matchup-direct-v1',sourceSha256:manifest.dataSha256,quoteSha256:hash(JSON.stringify(quotes)),
 features:'Existing prior-only player features plus own and opponent-allowed reported player totals: mean actual, mean workload, aggregate efficiency over last five bilateral team fixtures, minimum three, same season, 48-hour result lag.',
 fitting:'Fixed ridge penalty 20, direct actual target and separate workload/rate fits. First 65% of eligible prior-season dates train; last 35% calibrate with 48h embargo. At least100 training and100 calibration observations. No tuning or outcome-based quote selection.',
 comparison:'Current frozen evaluator versus new candidate on exactly the same eligible later-season targets and exact pregame quotes. Report candidate-only coverage and every group/side. Current model uses its original training/calibration population.',
 evaluation:'Previously inspected 2026 development outcomes; NOT an untouched holdout or prospective test. Improvement is diagnostic only.',
 unsupported:['NBA','NHL','CBB','Soccer','WNBA','MLB'],validatedForBetting:false,livePromotion:false};
await writeFile(output+'/protocol.json',JSON.stringify(protocol,null,2)+'\n');
const {footballMatchupIndex}=await loadTs(new URL('../lib/football-matchup-inputs.ts',import.meta.url));
const {evaluateProbabilityModels,fitLinear,predictLinear,distributionValues,forecastDistribution,empiricalCrps,evaluatePrice,quoteProblem,clusteredMeanInterval}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const current=evaluateProbabilityModels(games,quotes),inputs=footballMatchupIndex(games),key=g=>[g.sport,g.market,g.gameId,g.playerId].join('|');
const quoteMap=new Map();for(const q of quotes){if(quoteMap.has(key(q)))throw Error('Ambiguous selected quote');quoteMap.set(key(q),q)}
const models=[],reports=[],decisions=[];const average=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
for(const group of [...new Set(games.map(g=>g.sport+'|'+g.market))].sort()){
 const sourceRows=games.filter(g=>g.sport+'|'+g.market===group),rows=sourceRows.flatMap(g=>{const f=inputs(g);return f.features?[{g,x:f.features}]:[]});
 const prior=rows.filter(r=>r.g.season<'2026').sort((a,b)=>a.g.gameTime.localeCompare(b.g.gameTime));
 const dates=[...new Set(prior.map(r=>r.g.gameTime))].sort(),boundary=Date.parse(dates[Math.floor(dates.length*.65)]||'');
 const training=prior.filter(r=>Date.parse(r.g.gameTime)<boundary-48*3600000&&r.g.workload>0),calibration=prior.filter(r=>Date.parse(r.g.gameTime)>=boundary),targets=rows.filter(r=>r.g.season==='2026');
 const meta={group,trainingRows:training.length,calibrationRows:calibration.length,eligibleTargets:targets.length,totalLaterSeason:sourceRows.filter(g=>g.season==='2026').length};
 if(training.length<100||calibration.length<100){reports.push({...meta,reason:'insufficient_training_or_calibration'});continue;}
 const model={version:1,group,trainedThrough:training.at(-1).g.gameTime,calibratedThrough:calibration.at(-1).g.gameTime,
  featurePolicy:'football_matchup_reported_totals_v1',direct:fitLinear(training.map(r=>({x:r.x,y:r.g.actual}))),workload:fitLinear(training.map(r=>({x:r.x,y:r.g.workload}))),rate:fitLinear(training.map(r=>({x:r.x,y:r.g.actual/r.g.workload}))),minimum:group.endsWith('|receptions')?0:null,integer:true,validatedForBetting:false};
 if(!model.direct||!model.workload||!model.rate)throw Error('Singular fit');
 const point=x=>{const raw=predictLinear(model.direct,x);return model.minimum==null?raw:Math.max(model.minimum,raw)};
 model.residuals=calibration.map(r=>r.g.actual-point(r.x)).sort((a,b)=>a-b);models.push(model);
 const original=current.models.find(m=>m.group===group),paired=[],quoted=[],rejections={};
 for(const target of targets){
  const {g,x}=target;if(Date.parse(g.gameTime)-48*3600000<=Date.parse(model.calibratedThrough))throw Error('Candidate unavailable at target');
  const old=original?forecastDistribution(original,sourceRows,g):null;if(!old?.forecast)continue;
  const projection=point(x),values=distributionValues(model,projection);
  paired.push({gameId:g.gameId,mae:Math.abs(projection-g.actual),currentMae:Math.abs(old.forecast.projection-g.actual),crps:empiricalCrps(values,g.actual),currentCrps:empiricalCrps(old.forecast.values,g.actual)});
  const q=quoteMap.get(key(g));if(!q)continue;let issue=quoteProblem(q,g);
  const at=inputs(g,q.decisionAt),oldAt=forecastDistribution(original,sourceRows,g,q.decisionAt);
  issue=issue||(!at.features?at.reason:null)||oldAt.reason;
  if(issue){rejections[issue]=(rejections[issue]||0)+1;continue;}
  const comparison={current:evaluatePrice(oldAt.forecast.values,q),matchup:evaluatePrice(distributionValues(model,point(at.features)),q)};
  if(g.actual===q.line){rejections.push=(rejections.push||0)+1;continue;}
  const outcome=Number(g.actual>q.line),result={gameId:g.gameId,playerId:g.playerId,quoteId:q.quoteId,line:q.line,actual:g.actual,market:g.market,group,decisionAt:q.decisionAt};
  for(const [policy,p] of Object.entries(comparison)){
   const over=p.over/(p.over+p.under),side=p.candidateSide,price=side==='OVER'?q.overPrice:q.underPrice,won=side?side==='OVER'?outcome===1:outcome===0:null;
   result[policy]={overProbability:over,brier:(over-outcome)**2,side,won,profit:side?won?(price>0?price/100:100/-price):-1:null};
  }
  result.bookBrier=(comparison.current.marketOver-outcome)**2;quoted.push(result);decisions.push(result);
 }
 const sideReport=policy=>['OVER','UNDER'].map(side=>{const rs=quoted.filter(r=>r[policy].side===side);return {side,selections:rs.length,independentGames:new Set(rs.map(r=>r.gameId)).size,hits:rs.filter(r=>r[policy].won).length,hitRate:average(rs.map(r=>Number(r[policy].won))),roi:average(rs.map(r=>r[policy].profit)),roiInterval:clusteredMeanInterval(rs.map(r=>({gameId:r.gameId,value:r[policy].profit})))}});
 reports.push({...meta,pairedForecasts:paired.length,mae:average(paired.map(r=>r.mae)),currentMae:average(paired.map(r=>r.currentMae)),crps:average(paired.map(r=>r.crps)),currentCrps:average(paired.map(r=>r.currentCrps)),
  pairedCrpsImprovement:clusteredMeanInterval(paired.map(r=>({gameId:r.gameId,value:r.currentCrps-r.crps}))),exactSettledQuotes:quoted.length,independentQuotedGames:new Set(quoted.map(r=>r.gameId)).size,
  brier:average(quoted.map(r=>r.matchup.brier)),currentBrier:average(quoted.map(r=>r.current.brier)),bookBrier:average(quoted.map(r=>r.bookBrier)),
  pairedBrierImprovement:clusteredMeanInterval(quoted.map(r=>({gameId:r.gameId,value:r.current.brier-r.matchup.brier}))),pairedBookBrierImprovement:clusteredMeanInterval(quoted.map(r=>({gameId:r.gameId,value:r.bookBrier-r.matchup.brier}))),
  currentSides:sideReport('current'),matchupSides:sideReport('matchup'),rejections,validatedForBetting:false});
}
await writeFile(output+'/models.json.gz',gzipSync(JSON.stringify(models)+'\n',{level:9}));
await writeFile(output+'/evaluation.json',JSON.stringify({protocol,reports,decisions,livePromotion:false},null,2)+'\n');
console.log(JSON.stringify(reports,null,2));
