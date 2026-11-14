import assert from 'node:assert/strict';import {readFile,writeFile} from 'node:fs/promises';import {execFileSync} from 'node:child_process';import {resolve} from 'node:path';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {loadTs} from '../tests/load-ts.mjs';
const {nhlShadowForecast,priceNhlShadow}=await loadTs(new URL('../lib/nhl-shadow-model.ts',import.meta.url));
const F=resolve(import.meta.dirname,'..'),D=resolve(F,'model-research/cw08-nhl-v3'),W=resolve(F,'../work/cw08-v3'),sha=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await readFile(p,'utf8')),gz=async p=>JSON.parse(gunzipSync(await readFile(p)));
const bytes=await readFile(D+'/models.json'),committed=execFileSync('git',['show','007c02b:frontend/model-research/cw08-nhl-v3/models.json'],{cwd:resolve(F,'..')});assert.ok(bytes.equals(committed),'no model tuning after fresh results');
const models=JSON.parse(bytes),report=await read(D+'/validation-report.json'),receipt=await read(D+'/evaluation-input-receipt.json'),inputBytes=await readFile(W+'/evaluation-inputs.json.gz');assert.equal(sha(inputBytes),receipt.inputSha256);assert.equal(sha(bytes),receipt.modelsSha256);
const inputs=JSON.parse(gunzipSync(inputBytes)),records=[...await gz(resolve(F,'model-research/cw08-nhl-expanded/player-games.json.gz')),...await gz(D+'/november-records.json.gz')];
const byKey=new Map(records.map(r=>[[r.gameId,r.playerId].join('|'),r])),players=new Map();for(const r of records){const id=String(r.playerId);if(!players.has(id))players.set(id,[]);players.get(id).push(r);}
const archived=await read(D+'/archived-quotes.json'),quoteTargets=new Map(archived.rows.map(a=>[[a.market,a.game_id,a.player_id].join('|'),a.payload]));
let featureChecks=0,priceChecks=0,causalityChecks=0;
for(const r of inputs.filter((r,i)=>r.kind==='priced_diagnostic'||r.kind==='fresh'&&(r.originalPlayer||i%50===0))){
 const raw=byKey.get([r.game,r.player].join('|')),market=r.market,gameTime=r.kind==='priced_diagnostic'?quoteTargets.get([r.market,r.game,r.player].join('|')).gameTime:r.date+'T00:00:00.000Z';
 const at=r.quote?.decisionAt||gameTime,target={sport:'nhl',market,season:raw.season,gameId:r.game,playerId:r.player,teamId:raw.teamAbbrev,opponentId:raw.opponentTeamAbbrev,gameTime};
 const history=players.get(r.player).map(g=>({sport:'nhl',market,season:g.season,gameId:String(g.gameId),playerId:r.player,teamId:g.teamAbbrev,opponentId:g.opponentTeamAbbrev,gameTime:g.gameDate+'T00:00:00.000Z',actual:g[market],workload:g.timeOnIcePerGame/60}));
 const result=nhlShadowForecast(models[market],history,target,at);assert.ok(result.forecast);result.forecast.features.forEach((v,i)=>assert.ok(Math.abs(v-r.features[i])<1e-9));featureChecks++;
 const mutated=history.map(g=>Date.parse(g.gameTime)>=Date.parse(at)-48*3600000?{...g,actual:999,workload:999}:g);assert.deepEqual(nhlShadowForecast(models[market],mutated,target,at).forecast,result.forecast);causalityChecks++;
 if(r.kind==='priced_diagnostic'){
  const p=priceNhlShadow(result.forecast,r.quote),python=report.markets[market].actualQuotePopulationReplay.decisions.find(d=>d.game===r.game&&d.player===r.player);
  for(const [key,expected] of [['over',python.over],['under',python.under],['push',python.push],['overEv',python.overEv],['underEv',python.underEv]])assert.ok(Math.abs(p[key]-expected)<1e-10,key);
  assert.equal(p.candidateSide,python.researchSide);priceChecks++;
 }
}
const summary={modelsUnchangedSincePreEvaluationCommit:'007c02b',featureChecks,causalityChecks,independentPythonPriceProbabilityEvSideChecks:priceChecks,productionArtifactsChanged:false,prospectiveAcceptedCaptures:0,releaseApproved:false};await writeFile(D+'/verification.json',JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
