import test from 'node:test';import assert from 'node:assert/strict';
import {sourceTransport,providerRetryAt,sourceCacheTtl,deferredSource} from '../shadow/cw08/request-policy.mjs';
const NHL='https://api-web.nhle.com/v1',book='https://api.owlsinsight.com/api/v1/nhl/props';
function setup(){let clock=Date.parse('2026-11-14T16:00Z'),active=true;const gates=new Map(),cache=new Map(),waits=[];
 const adapter={now:()=>clock,readGate:o=>gates.get(o),writeGate:(o,s)=>gates.set(o,s),readCache:u=>cache.get(u),writeCache:(u,c)=>cache.set(u,c),wait:async ms=>{waits.push(ms);clock+=ms;},assertActive:()=>{if(!active)throw Error('lease_lost');}};
 return {client:()=>sourceTransport(adapter),gates,cache,waits,now:()=>clock,advance:ms=>clock+=ms,loseLease:()=>active=false};}
test('Retry-After seconds and dates are never shortened; absent headers use exponential backoff',()=>{
 const now=Date.parse('2026-11-14T16:00Z');assert.equal(providerRetryAt('3600',now),now+3600000);assert.equal(providerRetryAt('Sat, 14 Nov 2026 18:00:00 GMT',now),now+7200000);
 assert.equal(providerRetryAt(null,now,1),now+60000);assert.equal(providerRetryAt('bad',now,3),now+240000);assert.equal(providerRetryAt('0',now,20),now+900000);
});
test('durable origin cooldown prevents new requests across URLs and recreated clients',async()=>{
 const s=setup(),c=s.client();await c.beforeRequest(NHL+'/schedule/today');const error=await c.rateLimited(NHL+'/schedule/today','120');assert.ok(deferredSource(error));
 const blockedUntil=error.retryAt;await assert.rejects(s.client().beforeRequest(NHL+'/roster/NJD/current'),e=>e.message==='source_cooldown'&&e.retryAt===blockedUntil);assert.deepEqual(s.waits,[]);
 // Independent providers are paced independently; no alternate host or account bypass.
 await c.beforeRequest(book);s.advance(120001);await c.beforeRequest(NHL+'/roster/NJD/current');await c.succeeded(NHL+'/roster/NJD/current');assert.equal(s.gates.get('https://api-web.nhle.com').failures,0);
});
test('redirect and cross-endpoint requests share pacing; an expired lease stops further requests',async()=>{
 const s=setup(),c=s.client();await c.beforeRequest(NHL+'/roster/NJD/current');await c.beforeRequest(NHL+'/roster/NJD/20262027');assert.deepEqual(s.waits,[2000]);s.loseLease();await assert.rejects(c.beforeRequest(NHL+'/schedule/today'),/lease_lost/);
});
test('bounded public-data cache preserves original retrieval time and never caches odds, pregame fixtures or finals',async()=>{
 const s=setup(),c=s.client(),url=NHL+'/player/123/game-log/20252026/2',value={gameLog:[{goals:0}]};const first=s.now();await c.remember(url,value);s.advance(2000);
 const next=s.client();assert.deepEqual(await next.cached(url),{value});assert.equal(next.retrievedAt(url),first);
 const cooldown=await next.rateLimited(url,'300');assert.ok((await next.cached(url)).value);assert.ok(deferredSource(cooldown));
 s.advance(900000);assert.equal(await s.client().cached(url),null);
 for(const u of [book,NHL+'/gamecenter/2026020999/landing',NHL+'/gamecenter/2026020999/boxscore']){assert.equal(sourceCacheTtl(u),0);await c.remember(u,{doNotCache:true});assert.equal(s.cache.has(u),false);assert.equal(await c.cached(u),null);}
 await c.remember(NHL+'/player/999/game-log/20252026/2',{error:'malformed'});assert.equal(s.cache.has(NHL+'/player/999/game-log/20252026/2'),false);await c.remember(NHL+'/roster/NJD/current',{forwards:[],defensemen:[]});assert.equal(s.cache.has(NHL+'/roster/NJD/current'),false);
 assert.equal(sourceCacheTtl(NHL+'/roster/NJD/current'),900000);assert.equal(sourceCacheTtl(NHL+'/schedule/2026-11-14'),60000);
});
