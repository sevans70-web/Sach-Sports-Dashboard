import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const {quarterHistoryInput,quarterResearchPoint,quarterResearchDistribution}=await loadTs(new URL('../lib/q1-history-research.ts',import.meta.url));
const {fitLinear,empiricalCrps,clusteredMeanInterval}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const [nbaPath,nflPath,output]=process.argv.slice(2);if(!output)throw Error('NBA events, NFL quarter observations, NEW output directory required');
await fs.mkdir(output,{recursive:false});
const nbaBytes=await fs.readFile(nbaPath),nflBytes=await fs.readFile(nflPath),events=JSON.parse(nbaBytes),nfl=JSON.parse(gunzipSync(nflBytes));
const nba=events.filter(g=>g.q1Complete).flatMap(g=>g.players.flatMap(p=>[['q1_points','points'],['q1_rebounds','rebounds'],['q1_assists','assists'],['q1_threes_made','threes']].flatMap(([market,field])=>p[field]==null?[]:[{sport:'nba',market,playerId:p.playerId,teamId:p.teamId,gameId:g.gameId,gameTime:g.gameTime,season:g.season,actual:p[field],starter:p.starter}])));
const history=[...nba,...nfl.filter(r=>r.sport==='nfl')],reports=[],artifacts=[],predictions=[];
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
const quantile=(xs,p)=>xs[Math.min(xs.length-1,Math.floor(xs.length*p))];
for(const group of [...new Set(history.map(r=>r.sport+'|'+r.market))].sort()){
 const [sport,market]=group.split('|'),source=history.filter(r=>r.sport+'|'+r.market===group),byPlayer=new Map();
 for(const r of source){const key=r.playerId+'|'+r.teamId;const xs=byPlayer.get(key)||[];xs.push(r);byPlayer.set(key,xs)}
 const rows=source.flatMap(r=>{const input=quarterHistoryInput(byPlayer.get(r.playerId+'|'+r.teamId),r);return input?[{...r,...input,y:r.actual}]:[]});
 const prior=rows.filter(r=>r.season<'2026').sort((a,b)=>a.gameTime.localeCompare(b.gameTime)),dates=[...new Set(prior.map(r=>r.gameTime))].sort(),boundary=Date.parse(dates[Math.floor(dates.length*.65)]);
 const train=prior.filter(r=>Date.parse(r.gameTime)<boundary-48*3600000),cal=prior.filter(r=>Date.parse(r.gameTime)>=boundary),test=rows.filter(r=>r.season==='2026');
 const base={group,trainingRows:train.length,calibrationRows:cal.length,testRows:test.length,testFixtures:new Set(test.map(r=>r.gameId)).size};
 if(train.length<100||cal.length<100||!test.length){reports.push({...base,status:'insufficient_data'});continue}
 if(test.some(r=>Date.parse(r.gameTime)-48*3600000<=Date.parse(cal.at(-1).gameTime)))throw Error('Calibration/test overlap');
 const model=fitLinear(train),point=r=>quarterResearchPoint(model,r.x,sport),residuals=cal.map(r=>r.actual-point(r));
 const scored=test.map(r=>{const projection=point(r),values=quarterResearchDistribution(projection,residuals,sport);return {gameId:r.gameId,playerId:r.playerId,gameTime:r.gameTime,actual:r.actual,projection,baseline:r.baseline,absoluteError:Math.abs(r.actual-projection),baselineAbsoluteError:Math.abs(r.actual-r.baseline),crps:empiricalCrps(values,r.actual),baselineCrps:empiricalCrps(r.values,r.actual),inside80:r.actual>=quantile(values,.1)&&r.actual<=quantile(values,.9)}});
 const mae=mean(scored.map(r=>r.absoluteError)),baselineMae=mean(scored.map(r=>r.baselineAbsoluteError)),crps=mean(scored.map(r=>r.crps)),baselineCrps=mean(scored.map(r=>r.baselineCrps));
 const report={...base,mae,baselineMae,maeImprovementPct:100*(baselineMae-mae)/baselineMae,crps,baselineCrps,interval80Coverage:mean(scored.map(r=>Number(r.inside80))),bias:mean(scored.map(r=>r.projection-r.actual)),maeGainInterval:clusteredMeanInterval(scored.map(r=>({gameId:r.gameId,value:r.baselineAbsoluteError-r.absoluteError}))),status:mae<baselineMae&&crps<baselineCrps?'retrospective_point_and_distribution_gain':'not_improved_on_both_metrics',validatedForBetting:false};
 reports.push(report);artifacts.push({group,model,residuals,trainedThrough:train.at(-1).gameTime,calibratedThrough:cal.at(-1).gameTime,featurePolicy:'prior_q1_history_v1',validatedForBetting:false});predictions.push(...scored.map(r=>({...r,group})));console.log(JSON.stringify(report));
}
const report={createdAt:new Date().toISOString(),policy:'Fixed ridge=20; first65% prior-season timestamps fit; remaining35% calibrate; 48h embargo; 2026 retrospective evaluation; no test-driven model selection.',sources:[{path:nbaPath,sha256:createHash('sha256').update(nbaBytes).digest('hex')},{path:nflPath,sha256:createHash('sha256').update(nflBytes).digest('hex')}],reports,limitations:['Retrospective evaluation already inspected; not an independent holdout.','NBA labels conditional on certifiable quarter participation; absent labels never filled with zero.','Historical pregame availability and sportsbook quarter participation rules remain uncertified.','No exact historical prices or betting-profit evidence.','Cross-season same-team priors permitted with NBA366/NFL730-day lookback; current role confirmation still required.'],promoted:false};
await fs.writeFile(output+'/report.json',JSON.stringify(report,null,2));await fs.writeFile(output+'/candidates.json',JSON.stringify(artifacts));await fs.writeFile(output+'/predictions.jsonl',predictions.map(r=>JSON.stringify(r)).join('\n')+'\n');
