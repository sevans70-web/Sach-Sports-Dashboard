import {readFile,writeFile,mkdir} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {loadTs} from '../tests/load-ts.mjs';
const output=process.argv[2];if(!output)throw Error('Provide a NEW output directory');
const root=new URL('../',import.meta.url),hash=b=>createHash('sha256').update(b).digest('hex'),read=async p=>readFile(new URL(p,root));
const candidate='model-research/2026-10-29-p01-nba-under-conditioning/';
const candidateBytes=await read(candidate+'candidate-models.json.gz'),artifact=JSON.parse(gunzipSync(candidateBytes)),models=artifact.models;
const expected=JSON.parse(await read(candidate+'receipt.json')).files['candidate-models.json.gz'];assert.equal(hash(candidateBytes),expected);
const runtimeBytes=await read('model-runtime/snapshot.json.gz'),runtime=JSON.parse(gunzipSync(runtimeBytes));
const runtimeManifest={sha256:hash(runtimeBytes)};assert.equal(runtimeManifest.sha256,'b45c4ce8bafb7395c4742c7a58572f1cf51dc137455df9fb16453a3c0fb88080');
const observations=runtime.observations.filter(r=>r.sport==='nba');
const {basketballFeatureIndex}=await loadTs(new URL('../lib/basketball-model-inputs.ts',import.meta.url));
const inputs=basketballFeatureIndex(observations);
const {forecastDistribution,evaluatePrice,quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url)),{forecastInputReceipt}=await loadTs(new URL('../lib/forecast-input-receipt.ts',import.meta.url));
await mkdir(output,{recursive:false});
const protocol={createdAt:new Date().toISOString(),study:'p01-nba-points-participation-prospective-v1',candidateSha256:hash(candidateBytes),runtimeSha256:runtimeManifest.sha256,candidateSourceSha256:artifact.protocol.sourceSha256,
 selection:'All returned NBA points main-line ranking rows that have fresh exact two-sided prices and both candidate/baseline pregame inputs. No side, score, probability or outcome filtering. One quote per market/game/player; ambiguous targets excluded.',
 timing:'Freeze before kickoff. Compare both fixed models using the same frozen completed-game population and 48-hour prior-result lag. Exact input vectors, residual-artifact hashes and forecasts saved. No fitting or tuning in this script.',
 scoring:'After exact official final: conditional OVER Brier excluding pushes, OVER/UNDER direction hits, fixed >=55% conditional win and >=3% EV research selections, unit ROI refunding pushes, paired fixture-cluster intervals. Report unresolved, pushes and all markets/sides; no cherry-picking.',
 limitations:'Selected ranking-board cohort, not complete player population. Source revision and missing-context limitations remain. Models were developed on earlier inspected cohorts. Upcoming targets are new; only completion after this capture is eligible. Small samples cannot justify promotion; no fixed promised accuracy.',
 livePromotion:false,automaticFollowup:false};
await writeFile(output+'/protocol.json',JSON.stringify(protocol,null,2)+'\n');
await writeFile(output+'/candidate-models.json.gz',candidateBytes);await writeFile(output+'/runtime-snapshot.json.gz',runtimeBytes);
const decisions=[],rejections=[],requests=[],fixtures=new Map();const base='https://marvelous-wholeness-production-c8d3.up.railway.app';
for(const market of ['points']){
 const url=base+'/api/nba/rankings?market='+market;let data;
 try{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error('HTTP '+r.status);data=await r.json();}catch(e){requests.push({url,error:e.message});continue;}
 const decisionAt=new Date().toISOString();requests.push({url,receivedAt:decisionAt,payload:data,rows:data.rows?.length||0,responseSha256:hash(JSON.stringify(data))});
 const counts=new Map();for(const r of data.rows||[]){const k=String(r.gameId)+'|'+String(r.playerId);counts.set(k,(counts.get(k)||0)+1);}
 for(const r of data.rows||[]){
  const id={market,gameId:String(r.gameId||''),playerId:String(r.playerId||'')},reject=reason=>rejections.push({...id,reason});
  if(counts.get(id.gameId+'|'+id.playerId)!==1){reject('ambiguous_target');continue;}
  if(r.frozen||r.lockedAtKickoff||['in','post'].includes(r.gameState)||Date.parse(r.gameTime)<=Date.parse(decisionAt)){reject('not_new_pregame');continue;}
  let fixture=fixtures.get(id.gameId);
  if(!fixture){const fixtureUrl='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+encodeURIComponent(id.gameId);try{const response=await fetch(fixtureUrl,{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('HTTP '+response.status);const payload=await response.json(),comp=payload.header?.competitions?.[0];if(String(payload.header?.id)!==id.gameId||comp?.status?.type?.completed===true||comp?.status?.type?.state!=='pre'||comp?.competitors?.length!==2)throw Error('Exact upcoming official fixture unavailable');fixture={payload,url:fixtureUrl,retrievedAt:new Date().toISOString(),sourceSha256:hash(JSON.stringify(payload)),season:String(payload.header.season.year),gameTime:comp.date,homeTeamId:String(comp.competitors.find(c=>c.homeAway==='home')?.team.id),teams:comp.competitors.map(c=>String(c.team.id))};}catch(e){fixture={error:e.message};}fixtures.set(id.gameId,fixture);}
  if(fixture.error||Date.parse(fixture.gameTime)!==Date.parse(r.gameTime)||!fixture.teams.includes(String(r.teamId))){reject('official_fixture_identity_unavailable');continue;}
  const target={...id,sport:'nba',season:fixture.season,teamId:String(r.teamId),opponentId:fixture.teams.find(t=>t!==String(r.teamId)),gameTime:r.gameTime,basketballContext:{home:fixture.homeTeamId===String(r.teamId)}};
  const quote={...id,sport:'nba',period:'game',bookmaker:r.sportsbookKey,quoteId:r.quoteId,line:r.sportsbookLine,overPrice:r.overPrice,underPrice:r.underPrice,updatedAt:r.quoteUpdatedAt,capturedAt:decisionAt,decisionAt,mainLine:r.lineType==='main'};
  const issue=quoteProblem(quote,target);if(issue){reject(issue);continue;}
  const model=models.find(m=>m.group==='nba|'+market),old=runtime.models.find(m=>m.group===model?.group),features=inputs(target,decisionAt);
  if(!model||!old||!features.features||Date.parse(decisionAt)-48*3600000<=Date.parse(model.calibratedThrough)){reject(features.reason||'candidate_unavailable');continue;}
  const baseline=forecastDistribution(old,observations,target,decisionAt);if(!baseline.forecast){reject(baseline.reason);continue;}
  const next=forecastDistribution(model,observations,target,decisionAt,inputs);if(!next.forecast){reject(next.reason);continue;}
  decisions.push({target,quote,baseline:{projection:baseline.forecast.projection,inputFeatures:baseline.forecast.inputFeatures,inputReceipt:forecastInputReceipt(old.group,runtimeManifest.sha256,decisionAt,baseline.forecast.inputFeatures),values:baseline.forecast.values,price:evaluatePrice(baseline.forecast.values,quote)},candidate:{projection:next.forecast.projection,inputFeatures:next.forecast.inputFeatures,inputReceipt:forecastInputReceipt(model.group,hash(candidateBytes),decisionAt,next.forecast.inputFeatures),values:next.forecast.values,price:evaluatePrice(next.forecast.values,quote)}});
 }
}
const completedAt=new Date().toISOString();if(decisions.some(d=>Date.parse(d.target.gameTime)<=Date.parse(completedAt)))throw Error('Fixture began during capture; do not score this cohort');
const cohort={protocol,completedAt,requests,fixtures:[...fixtures.values()],rejections,decisions,livePromotion:false};const text=JSON.stringify(cohort,null,2)+'\n';await writeFile(output+'/cohort.json',text);await writeFile(output+'/receipt.json',JSON.stringify({sha256:hash(text),decisions:decisions.length,independentGames:new Set(decisions.map(d=>d.target.gameId)).size},null,2)+'\n');console.log(JSON.stringify({decisions:decisions.length,independentGames:new Set(decisions.map(d=>d.target.gameId)).size,rejections:rejections.length,requests:requests.map(({payload,...r})=>r)},null,2));
