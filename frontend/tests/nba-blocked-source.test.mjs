import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {runJobBudget} from '../jobs/budget.mjs';
import {loadTs} from './load-ts.mjs';
const {validateNbaHistoryEvidence,readNbaHistorySource}=await loadTs(new URL('../lib/nba-history-evidence.ts',import.meta.url));

test('a validated FINAL is recovered by background without a new provider request or timestamp rewrite',async()=>{
 const archive=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nba-official-censuses-2026-11-15.json.gz',import.meta.url)))),f=archive.accepted[0],at=archive.provenance.revalidatedAt,now=Date.parse(at)+20*60000;
 const stored=validateNbaHistoryEvidence(f.source,f.payload,at,now);let live=0,writes=0;
 const result=await readNbaHistorySource(f.source,now,async()=>{live++;throw Error('HTTP403');},{read:()=>stored,write:()=>{writes++;}});
 assert.equal(result.recovered,true);assert.deepEqual(result.evidence,stored);assert.equal(live,0);assert.equal(writes,0);
});

test('optional NBA baseline/summary403 does not poison capture, exact-url cooldown persists, and rate limits remain strict',async()=>{
 const native=globalThis.fetch,cache=new Map(),seen=[];
 const store={cacheRead:k=>cache.get(k),cacheWrite:(k,v)=>{cache.set(k,v);return true}};
 const options={env:{},store,gate:async()=>0,cacheSources:true,allowNbaSourceDenials:true};
 const urls=['https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/statistics/byathlete?season=2026','https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401909988'];
 try{
  globalThis.fetch=async u=>{seen.push(String(u));return new Response('{}',{status:403});};
  for(const url of urls){
   const r=await runJobBudget(options,async()=>{assert.equal((await fetch(url)).status,403);return {checkpoint:'validated_inputs_still_accessible'};});
   assert.equal(r.result.checkpoint,'validated_inputs_still_accessible');assert.equal(r.usage.cacheWrites,0,'denial is not evidence progress');assert.equal(r.usage.sourceDenials.length,1);
   await runJobBudget({...options,store:{...store}},async()=>assert.equal((await fetch(url)).status,403));
  }
  assert.deepEqual(seen,urls,'no alternate host/profile or repeated denied call');
  const generic={...options,allowNbaSourceDenials:false};await assert.rejects(runJobBudget(generic,()=>fetch(urls[0])),e=>e.message==='job_source_http_403'&&e.details.endpoint===urls[0].split('?')[0]&&e.details.status===403);
  globalThis.fetch=async()=>new Response('{}',{status:429,headers:{'Retry-After':'120'}});
  await assert.rejects(runJobBudget(options,()=>fetch(urls[0]+'&fresh-contract=1')),/provider_http_429/);
 }finally{globalThis.fetch=native;}
});
