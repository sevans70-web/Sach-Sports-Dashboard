// Independent offline replay of Python parameters and official input receipts.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {loadTs} from '../tests/load-ts.mjs';
const {nhlOpportunityGames,opportunityFeatures}=await loadTs(new URL('../lib/opportunity-backtest.ts',import.meta.url));
const frontend=resolve(import.meta.dirname,'..'),root=resolve(frontend,'model-research/cw08-nhl-expanded')+'/',work=process.env.CW08_WORK_DIR||resolve(frontend,'../work/cw08-nhl-expanded');
const read=async name=>JSON.parse(await readFile(root+name,'utf8')),hash=x=>createHash('sha256').update(x).digest('hex');
const p=await read('protocol.json'),manifest=await read('source-manifest.json'),receipt=await read('feature-receipt.json'),report=await read('comparison-report.json'),models=await read('candidate-models.json');
const source=await readFile(root+'player-games.json.gz'),featureBytes=await readFile(resolve(work,'features.json.gz'));
assert.equal(hash(source),manifest.compressedSha256);assert.equal(hash(source),receipt.sourceSha256);
assert.equal(hash(await readFile(root+'protocol.json')),receipt.protocolSha256);assert.equal(receipt.protocolSha256,report.protocolSha256);
assert.equal(hash(featureBytes),receipt.featureSha256);assert.equal(hash(featureBytes),report.featureSha256);
assert.equal(hash(await readFile(resolve(frontend,'model-runtime/snapshot.json.gz'))),receipt.runtimeSha256);
const raw=JSON.parse(gunzipSync(source)),features=JSON.parse(gunzipSync(featureBytes));
const rawMap=new Map(raw.map(r=>[[r.season,r.playerId,r.gameId].join('|'),r]));assert.equal(rawMap.size,raw.length);
assert.ok(raw.every(r=>r.gameDate<=p.collectionCutoff&&r.goals>=0&&r.assists>=0&&r.timeOnIcePerGame>=0));
const checks=JSON.parse(gunzipSync(await readFile(root+'gamelog-crosschecks.json.gz')));let checkedGames=0;
for(const {receipt:r,payload} of checks){
 const parsed=nhlOpportunityGames(payload,{sport:'nhl',season:r.season,playerId:String(r.playerId),playerName:'crosscheck',source:r.url,retrievedAt:'2026-11-14T00:00:00Z'});
 const games=new Map(parsed.filter(g=>['goals','assists'].includes(g.market)).map(g=>[[g.gameId,g.market].join('|'),g]));
 for(const row of raw.filter(g=>g.season===r.season&&g.playerId===r.playerId)){
  for(const market of ['goals','assists']){const g=games.get([row.gameId,market].join('|'));assert.ok(g);assert.equal(g.actual,row[market]);assert.ok(Math.abs(g.workload-row.timeOnIcePerGame/60)<1e-9);}
  checkedGames++;
 }
}
const accum={};let distributions=0,lagChecks=0;
for(const market of ['goals','assists']){
 const model=models[market],rows=features.filter(r=>r.market===market),train=rows.filter(r=>r.date<=p.fitThrough);
 assert.equal(train.length,model.trainingRows);assert.equal(report.markets[market].calibrationLead,'expanded_hurdle');
 for(let j=0;j<10;j++)assert.ok(Math.abs(train.reduce((n,r)=>n+r.x[j],0)/train.length-model.featureMeans[j])<1e-10);
 const h=model.hurdle;
 for(let i=0;i<rows.length;i++){
  const r=rows[i],x=r.x.map((v,j)=>(v-model.featureMeans[j])/model.featureScales[j]);
  const eta=h.eventIntercept+h.eventCalibrationIntercept+x.reduce((n,v,j)=>n+v*h.eventCoefficients[j],0),q=1/(1+Math.exp(-eta));
  const lam=Math.exp(h.positiveCoefficients[0]+x.reduce((n,v,j)=>n+v*h.positiveCoefficients[j+1],0))*h.positiveCalibrationFactor;
  const mu=q*lam/(-Math.expm1(-lam));
  if(i%1000===0){
   let mass=1-q,moment=0,pk=q*Math.exp(-lam)/(-Math.expm1(-lam));
   for(let k=1;k<=100;k++){pk*=lam/k;mass+=pk;moment+=k*pk;}
   assert.ok(Math.abs(mass-1)<1e-10);assert.ok(Math.abs(moment-mu)<1e-9);distributions++;
  }
  let window=null;if(r.date>=p.testFrom&&r.date<=p.testThrough)window='test';if(r.date>=p.confirmationFrom&&r.date<=p.confirmationThrough)window='confirmation';
  if(window)for(const cohort of ['all',...(!r.originalPlayer?['outside_original_ten']:[])]){
   const key=[market,window+'_'+cohort].join('|'),a=accum[key]||{n:0,brier:0,bias:0};
   a.n++;a.brier+=(q-Number(r.y>0))**2;a.bias+=mu-r.y;accum[key]=a;
  }
 }
 for(const target of rows.filter((_,i)=>i%15000===0)){
  const team=rawMap.get([target.season,target.player,target.game].join('|')).teamAbbrev;
  const history=raw.filter(r=>String(r.playerId)===target.player&&r.season===target.season&&r.teamAbbrev===team).map(r=>({sport:'nhl',market,season:r.season,playerId:String(r.playerId),teamId:r.teamAbbrev,gameId:String(r.gameId),gameTime:r.gameDate+'T00:00:00.000Z',actual:r[market],workload:r.timeOnIcePerGame/60}));
  const g=history.find(g=>g.gameId===target.game),cutoff=Date.parse(g.gameTime)-48*3600000;
  const poisoned=history.map(row=>Date.parse(row.gameTime)>=cutoff?{...row,actual:999,workload:999}:row);
  assert.deepEqual(opportunityFeatures(history,g).features,target.x);assert.deepEqual(opportunityFeatures(poisoned,g).features,target.x);lagChecks++;
 }
}
for(const [key,a] of Object.entries(accum)){
 const [market,group]=key.split('|'),m=report.markets[market].evaluation[group].models.expanded_hurdle;
 assert.equal(a.n,m.n);assert.ok(Math.abs(a.brier/a.n-m.brier05)<1e-10);assert.ok(Math.abs(a.bias/a.n-m.meanBias)<1e-10);
}
assert.equal(report.selectionApproved,false);
const result={sourceRows:raw.length,featureRows:features.length,officialGamelogGamesCrosschecked:checkedGames,independentDistributionChecks:distributions,targetAndFutureMutationChecks:lagChecks,pythonHurdleMetricsReproducedGroups:Object.keys(accum).length,protocolHashVerified:true,runtimeSnapshotUnchanged:true,selectionApproved:false};
await writeFile(root+'verification.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
