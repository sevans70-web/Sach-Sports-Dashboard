import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {rolldown} from 'rolldown';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const recorded=JSON.parse(gunzipSync(await readFile(new URL('../../docs/audits/2026-11-15-release-blockers/recorded-browser-inputs.json.gz',import.meta.url)))).files;
const markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'];
const now=Date.parse('2026-11-15T15:54:10Z'),day='2026-11-15';
const key=(scope,market)=>`sach:pregame-board:v1:${scope}:${day}:${market}`;
const entry=market=>({capturedAt:Date.parse(recorded['nba-'+market+'.json'].updatedAt),pregameOnly:true,board:{...recorded['nba-'+market+'.json'],boardDay:day}});

test('shipping Worker serves exact recent NBA evidence before blocked recovery; scope, expiry and other sports remain protected',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-cache-first-'));let mf;
 try{
  // Run the actual shipping fetch wrapper, not a reconstructed route. The
  // application boundary stands for a stalled/denied recovery; if called it
  // returns503. Recorded November15 inputs are an offline fixture, not live QA.
  const mocks={
   'vinext/shims/fetch-cache':'export function ensureFetchPatch(){}',
   'vinext/server/fetch-handler':`let calls=0;const board=${JSON.stringify(recorded['nba-points.json'])};export default{async fetch(r){const url=new URL(r.url);if(url.pathname==='/__test_calls')return Response.json({calls});calls++;if(url.searchParams.get('fixture')==='success')return Response.json(board);return Response.json({success:false,rows:[],reason:'nba_official_history_unavailable'},{status:503});}};`,
   './jobs/coordinator.mjs':'export function dashboardJobClass(){return class{}};export function enqueueDashboardTick(){throw Error("No job changes allowed")}',
   './lib/worker-grading-replay':'export function createWorkerGradingReplay(){throw Error("No grading changes allowed")}',
   './lib/worker-final-observations':'export function saveWorkerFinalCorrections(){throw Error("No evidence writes allowed")}',
   './lib/ranking-market-coverage':'export async function recordRankingMarket(){}',
   './scripts/worker-pregame-capture.mjs':"export const PREGAME_MARKETS={},PREGAME_CAPTURE_CRON='*/2 * * * *',PREGAME_GRADE_CRON='0,30 * * * *';",
   './scripts/worker-history-backup.mjs':'export function archiveWorkerHistoryDay(){throw Error("No backup changes")};export function workerHistoryBackupScope(){}',
   './scripts/worker-pregame-backup.mjs':'export function archiveWorkerPregameDay(){throw Error("No backup changes")}',
  };
  await writeFile(join(dir,'entry.mjs'),`import worker from '${resolve('worker-entry.mjs')}';const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[${now}]))}static now(){return ${now}}};export default worker;`);
  const build=await rolldown({input:join(dir,'entry.mjs'),platform:'neutral',external:[/^node:/,'cloudflare:workers'],plugins:[{name:'isolate-application-and-storage-writes',resolveId(id,importer){if(mocks[id])return '\0'+id;if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts');if(importer===resolve('worker-entry.mjs')&&id.startsWith('./lib/'))return resolve(id.slice(2)+'.ts');},load(id){if(id.startsWith('\0'))return mocks[id.slice(1)];}}]});
  await build.write({file:join(dir,'worker.mjs'),format:'esm'});await build.close();
  const opts=convertV4MiniflareOptions({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],kvNamespaces:['VINEXT_KV_CACHE'],outboundService:()=>{throw Error('No real provider, production or research access allowed');}});
  opts.workers[0].config.limits={subrequests:350,cpuMs:30000};mf=new Miniflare(opts);
  const kv=await mf.getKVNamespace('VINEXT_KV_CACHE'),saved=new Map();
  for(const market of markets)for(const scope of ['nba','nba-active']){
   const k=key(scope,market),value=JSON.stringify(entry(market));saved.set(k,value);await kv.put(k,value);
  }
  const results=await Promise.all(markets.flatMap(market=>['','&day='+day].map(async suffix=>{
   const response=await mf.dispatchFetch('https://test/api/nba/rankings?market='+market+suffix),board=await response.json();
   assert.equal(response.status,200,market);assert.equal(board.dataState,'stale');assert.equal(board.refreshing,false);
   assert.match(board.coverageNotice,/not a new live quote/);assert.equal(board.retainedAt,recorded['nba-'+market+'.json'].updatedAt);
   const original=r=>[r.rank,r.playerId,r.sportsbookLine,r.overPrice,r.underPrice,r.quoteId,r.quoteUpdatedAt,r.boardCapturedAt,r.forecastCapturedAt,r.researchForecast];
   assert.deepEqual(board.rows.map(original),recorded['nba-'+market+'.json'].rows.map(original));
   assert.ok(board.evDiagnostics.available>0);return {market,scope:suffix?'explicit':'active',rows:board.rows.length,ev:board.evDiagnostics};
  })));
  const calls=async()=>Number((await (await mf.dispatchFetch('https://test/__test_calls')).json()).calls);
  assert.equal(await calls(),0,'cold concurrent cache hits must never start history/model recovery');
  for(const [k,v] of saved)assert.equal(await kv.get(k),v,'cache reads must not rewrite the original evidence');
  for(const patch of [
   {capturedAt:now-10*60000},
   {capturedAt:now+1},
   {pregameOnly:false},
   {board:{...entry('points').board,boardDay:'2026-11-14'}},
   {board:{...entry('points').board,rows:entry('points').board.rows.map(r=>({...r,market:'rebounds'}))}},
   {board:{...entry('points').board,rows:entry('points').board.rows.map(r=>({...r,gameTime:new Date(now-1).toISOString()}))}},
   {board:{...entry('points').board,rows:entry('points').board.rows.map(r=>({...r,quoteUpdatedAt:new Date(now-16*60000).toISOString()}))}},
   {board:{...entry('points').board,rows:entry('points').board.rows.map(r=>({...r,researchForecast:{status:'unavailable'}}))}},
  ]){
   for(const scope of ['nba','nba-active'])await kv.put(key(scope,'points'),JSON.stringify({...entry('points'),...patch}));
   const before=await calls(),response=await mf.dispatchFetch('https://test/api/nba/rankings?market=points');
   assert.equal(response.status,503);assert.equal(await calls(),before+1,'invalid evidence must go through normal unavailable handling');
  }
  // A filtered board may contain only late games. Its earlier daily slate
  // lock still takes precedence over the listed players' start times.
  await kv.delete(key('nba','points'));
  for(const boardLockAt of [null,new Date(now).toISOString(),new Date(entry('points').capturedAt).toISOString()]){
   await kv.put(key('nba-active','points'),JSON.stringify({...entry('points'),board:{...entry('points').board,boardLockAt}}));
   const before=await calls(),response=await mf.dispatchFetch('https://test/api/nba/rankings?market=points');
   assert.equal(response.status,503);assert.equal(await calls(),before+1,'unknown/passed daily lock must use normal frozen-board handling');
  }
  // An explicit-day board cannot seed the default navigation's identity.
  await kv.put(key('nba','points'),JSON.stringify(entry('points')));await kv.delete(key('nba-active','points'));
  const before=await calls();await mf.dispatchFetch('https://test/api/nba/rankings?market=points');assert.equal(await calls(),before+1);
  for(const path of ['/api/nba/rankings?market=points&slate=previous','/api/nba/rankings?market=first_basket','/api/nba/rankings?market=q1_points','/api/nfl/rankings?market=passing_yards','/api/nhl/rankings?market=shots_on_goal']){
   const before=await calls();await mf.dispatchFetch('https://test'+path);assert.equal(await calls(),before+1,path);
  }
  const waitForKey=async k=>{for(let i=0;i<20;i++){const value=await kv.get(k,'json');if(value)return value;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('cache publication did not complete');};
  for(const scope of ['nba','nba-active'])await kv.delete(key(scope,'points'));
  assert.equal((await mf.dispatchFetch('https://test/api/nba/rankings?market=points&fixture=success&day='+day)).status,200);
  await waitForKey(key('nba','points'));assert.equal(await kv.get(key('nba-active','points')),null,'explicit-day publication must not seed default navigation');
  assert.equal((await mf.dispatchFetch('https://test/api/nba/rankings?market=points&fixture=success')).status,200);
  const published=await waitForKey(key('nba-active','points'));
  assert.equal(published.capturedAt,Date.parse(recorded['nba-points.json'].updatedAt));
  assert.deepEqual(published.board.rows,recorded['nba-points.json'].rows);
  const beforeHit=await calls();assert.equal((await mf.dispatchFetch('https://test/api/nba/rankings?market=points')).status,200);assert.equal(await calls(),beforeHit);
  console.log('NBA_CACHE_FIRST_RECORDED_RUNTIME',JSON.stringify({results,concurrentCacheRecoveryCalls:0,evidenceUnchanged:true,productionAccess:false}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
