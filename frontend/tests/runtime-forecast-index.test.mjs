import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';import {performance} from 'node:perf_hooks';import {loadTs} from './load-ts.mjs';
const {fittedResearchForecast,createRuntimeForecastIndex}=await loadTs(new URL('../lib/live-model-forecast.ts',import.meta.url));
test('batch indexing preserves complete fitted outputs on the shipped basketball artifact',async t=>{
 const raw=await readFile(new URL('../model-runtime/snapshot.json.gz',import.meta.url));
 const manifest=JSON.parse(await readFile(new URL('../model-runtime/manifest.json',import.meta.url),'utf8'));
 const data={...JSON.parse(gunzipSync(raw)),asOf:manifest.asOf,digest:manifest.sha256,gi:{}};
 const now=Math.max(Date.parse(data.asOf||'2026-10-19'),...data.observations.map(g=>Date.parse(g.gameTime)))+3*86400000;
 const fixtures=[];
 for(const model of data.models.filter(m=>m.group.startsWith('nba|'))){
  const market=model.group.split('|')[1],latest=new Map();
  for(const g of data.observations.filter(g=>g.sport==='nba'&&g.market===market))if(!latest.has(g.playerId)||g.gameTime>latest.get(g.playerId).gameTime)latest.set(g.playerId,g);
  for(const g of [...latest.values()].slice(0,6)){
   const gameTime=new Date(now+86400000).toISOString(),gameId='equivalence-'+g.playerId;
   fixtures.push({...g,gameId,gameTime,pregameContext:{gameId,gameTime,playerId:g.playerId,teamId:g.teamId,opponentId:g.opponentId,season:g.season,seasonType:2,homeAway:'home'}});
  }
 }
 let start=performance.now();const baseline=fixtures.map(row=>fittedResearchForecast(row,'nba',row.market,data,now)),baselineMs=performance.now()-start;
 start=performance.now();const index=createRuntimeForecastIndex(data.observations);
 const indexed=fixtures.map(row=>fittedResearchForecast(row,'nba',row.market,data,now,index)),indexedMs=performance.now()-start;
 assert.deepEqual(indexed,baseline);assert(indexed.some(r=>r.status==='available'));assert.equal(index.basketball.size,6);
 assert.equal(fixtures.some(r=>r.researchForecast!=null),false);
 t.diagnostic(JSON.stringify({players:fixtures.length,available:indexed.filter(r=>r.status==='available').length,baselineMs:Math.round(baselineMs),indexedMs:Math.round(indexedMs)}));
});
