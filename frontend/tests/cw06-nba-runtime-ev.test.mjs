import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {resolve} from 'node:path';
import {loadTs} from './load-ts.mjs';import {workerModelRuntimePlugin} from '../build/worker-model-runtime.mjs';
const {fittedResearchForecast,attachFittedResearchForecasts}=await loadTs(new URL('../lib/live-model-forecast.ts',import.meta.url));
const {nbaCombinationHistory}=await loadTs(new URL('../lib/nba-combination-history.ts',import.meta.url));
const {nbaRankingEv}=await loadTs(new URL('../lib/nba-ranking-ev.ts',import.meta.url));
const {scopedNbaBoard,nbaFixtureDay}=await loadTs(new URL('../lib/nba-slate-scope.ts',import.meta.url));
const manifest=JSON.parse(await readFile(new URL('../model-runtime/manifest.json',import.meta.url))),snapshot=JSON.parse(gunzipSync(await readFile(new URL('../model-runtime/snapshot.json.gz',import.meta.url)))),combos=JSON.parse(await readFile(new URL('../model-runtime/nba-combination-models.json',import.meta.url)));
const code=workerModelRuntimePlugin().transform('',resolve(import.meta.dirname,'../lib/worker-model-runtime.ts')),worker=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'];
for(const market of markets)test('CW06 shipped Node/Cloudflare '+market+' joint distribution reaches API EV without retraining',async()=>{
 const inputs={...snapshot,models:[...snapshot.models,...combos.models],digest:manifest.sha256,asOf:manifest.asOf,gi:{},giStatus:{}},embedded={...worker.workerModelRuntime('nba',market)};
 if(market.startsWith('pts_')){inputs.observations=nbaCombinationHistory(inputs.observations,market);embedded.observations=nbaCombinationHistory(embedded.observations,market);}
 const now=Math.max(Date.parse(manifest.asOf),...inputs.observations.filter(g=>g.sport==='nba').map(g=>Date.parse(g.gameTime)))+3*86400000;
 const latest=new Map();for(const g of inputs.observations.filter(g=>g.sport==='nba'&&g.market===market))if(!latest.has(g.playerId)||g.gameTime>latest.get(g.playerId).gameTime)latest.set(g.playerId,g);
 let matched=null;for(const g of latest.values()){
  const gameId='cw06-'+market+'-'+g.playerId,gameTime=new Date(now+86400000).toISOString(),at=new Date(now).toISOString();
  let row={...g,sport:'nba',market,rank:17,gameId,gameTime,pregameContext:{gameId,gameTime,playerId:g.playerId,teamId:g.teamId,opponentId:g.opponentId,season:g.season,seasonType:2,homeAway:'home'}};
  const initial=fittedResearchForecast(row,'nba',market,inputs,now);if(initial.status!=='available')continue;
  row={...row,quoteVersion:1,quoteId:'cw06-quote-'+market,sportsbook:'Test book',sportsbookKey:'test-book',lineType:'main',sportsbookLine:Math.max(.5,Math.ceil(initial.projection)+.5),overPrice:-110,underPrice:-110,quoteUpdatedAt:new Date(now-1000).toISOString(),capturedAt:at,boardCapturedAt:at,forecastCapturedAt:at,prediction:'NO PICK'};
  const f=fittedResearchForecast(row,'nba',market,inputs,now),cf=fittedResearchForecast(row,'nba',market,embedded,now);assert.deepEqual(cf,f,'embedded Worker and Node outputs agree');assert.ok(f.priceComparison);assert.ok(Math.abs(f.priceComparison.overProbability+f.priceComparison.underProbability+f.priceComparison.pushProbability-1)<1e-10);
  row={...row,researchForecast:f};const before=structuredClone(row),ev=nbaRankingEv(row,now);assert.equal(ev.status,'available',market);assert.equal(row.rank,17);assert.deepEqual(row,before);
  const win=ev.side==='OVER'?f.priceComparison.overProbability:f.priceComparison.underProbability,loss=ev.side==='OVER'?f.priceComparison.underProbability:f.priceComparison.overProbability;assert.ok(Math.abs(ev.percent-100*(win*100/110-loss))<1e-10);
  const api=scopedNbaBoard({market,rows:[row]},market,nbaFixtureDay(gameTime),now);assert.equal(api.rows[0].rank,17);assert.equal(api.rows[0].prediction,'NO PICK');assert.equal(api.rows[0].nbaEv.status,'available');assert.equal(api.evDiagnostics.available,1);assert.deepEqual(row,before);
  const oldStamp=new Date(now-60000).toISOString(),freshInput={...row,forecastCapturedAt:oldStamp,overPrice:-10000,underPrice:-10000};
  const attached=await attachFittedResearchForecasts({market,rows:[freshInput]},'nba',now,{offlineOnly:true});const priced=attached.rows[0];
  assert.equal(priced.researchForecast.modelSelection,null);assert.equal(priced.forecastCapturedAt,at,'comparison gets its own actual pregame timestamp');assert.equal(freshInput.forecastCapturedAt,oldStamp);assert.equal(nbaRankingEv(priced,now).status,'available');
  const frozen={...row,boardFrozen:true,frozen:true,lockedAtKickoff:true};const originalForecast=structuredClone(frozen.researchForecast),saved=await attachFittedResearchForecasts({market,rows:[frozen]},'nba',now,{offlineOnly:true});assert.deepEqual(saved.rows[0].researchForecast,originalForecast);assert.equal(saved.rows[0].forecastCapturedAt,frozen.forecastCapturedAt);
  const past={...row,gameState:'post',forecastCapturedAt:new Date(now+1000).toISOString()},preserved=await attachFittedResearchForecasts({market,rows:[past]},'nba',now+2*86400000,{offlineOnly:true});assert.deepEqual(preserved.rows[0].researchForecast,past.researchForecast);assert.equal(preserved.rows[0].forecastCapturedAt,past.forecastCapturedAt,'started games without a frozen flag retain their exact original timestamp');
  matched=row;break;
 }
 assert.ok(matched,'shipped model/history must support an actual player fixture');
});
