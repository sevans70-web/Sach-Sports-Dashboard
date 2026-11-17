import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
import {runJobBudget} from '../jobs/budget.mjs';
const {nbaOfficialFetch}=await loadTs(new URL('../lib/official-history-source.ts',import.meta.url));
const url=id=>`https://site.web.api.espn.com/apis/common/v3/sports/basketball/nba/athletes/${id}/gamelog?season=2027`;
test('one NBA athlete denial cannot suppress other athletes or seasons; repeat denied URL remains cooled down',async()=>{
 const original=globalThis.fetch,calls=[];
 try{
  globalThis.fetch=async input=>{calls.push(String(input));return String(input)===url(101)?new Response('{}',{status:403}):Response.json({seasonTypes:[],events:{}});};
  assert.equal((await nbaOfficialFetch(url(101))).status,403);
  assert.equal((await nbaOfficialFetch(url(102))).status,200);
  assert.equal((await nbaOfficialFetch(url(101).replace('2027','2026'))).status,200);
  assert.equal((await nbaOfficialFetch(url(101))).status,403);
  assert.equal(calls.length,3);
  assert.equal((await nbaOfficialFetch(url(102))).status,200);assert.equal(calls.length,3);
 }finally{globalThis.fetch=original;}
});
test('persistent NBA capture denial is athlete/season specific across restart, without relaxing NFL or provider limits',async()=>{
 const original=globalThis.fetch,calls=[],cache=new Map(),store={cacheRead:k=>cache.get(k),cacheWrite:(k,v)=>{cache.set(k,v);return true}};
 const opts={env:{},store,gate:async()=>0,cacheSources:true,allowNbaSourceDenials:true};
 try{
  globalThis.fetch=async input=>{calls.push(String(input));return String(input)===url(201)?new Response('{}',{status:403}):Response.json({seasonTypes:[],events:{}});};
  assert.equal((await runJobBudget(opts,()=>fetch(url(201)))).result.status,403);
  const healthy=await runJobBudget(opts,()=>fetch(url(202)));assert.equal(healthy.result.status,200);assert.equal(healthy.usage.denialHits,0);
  const resumed=await runJobBudget({...opts,store:{...store}},()=>fetch(url(201)));assert.equal(resumed.result.status,403);assert.equal(resumed.usage.denialHits,1);assert.equal(calls.length,2);
  const otherSeason=await runJobBudget(opts,()=>fetch(url(201).replace('2027','2026')));assert.equal(otherSeason.result.status,200);
 }finally{globalThis.fetch=original;}
});
