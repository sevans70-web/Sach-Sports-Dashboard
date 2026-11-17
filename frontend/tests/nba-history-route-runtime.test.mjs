import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {rolldown} from 'rolldown';import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
test('real NBA handler in workerd reports whole-history outage503 across7markets and preserves normal empty200',{timeout:60000},async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-history-route-'));let mf;
 try{
  const fixtures={};for(const m of ['points','rebounds'])fixtures[m]=JSON.parse(await readFile(resolve('../docs/audits/2026-11-17-r1-approved-rollback/nba-'+m+'-coverage.json')));
  const markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'];
  await writeFile(join(dir,'entry.mjs'),`import {GET} from '${resolve('app/api/nba/rankings/route.ts')}';import {NextRequest,withinRequest} from '${resolve('tests/fixtures/ranking-framework.mjs')}';export default{fetch(r,e,c){globalThis.testNbaEmpty=new URL(r.url).searchParams.get('empty')==='1';return withinRequest(c,()=>GET(new NextRequest(r)));}};`);
  const mocks={
   '@/lib/nba-rankings-server':`const evidence=${JSON.stringify(fixtures)};export async function buildNbaMarketRankings(m){return globalThis.testNbaEmpty?{success:true,market:m,rows:[],quoteMatchAudit:{integrityVerifiedQuotes:0},forecastBlockers:{}}:{...evidence[m]||evidence.points,market:m,rows:[]};}`,
   '@/lib/nba':`export const NBA_MARKETS=${JSON.stringify(markets.map(m=>[m,m]))};export async function loadNbaGames(){return[];}`,
   '@/lib/nba-slate-board':`export async function readNbaSlateBoard(){return null;}export function currentNbaPregameSnapshot(){return null;}`,
   '@/lib/nba-board-window':`export function nbaBoardDates(){return {today:'2026-11-17',previous:'2026-11-16',tomorrow:'2026-11-18'};}export function activeNbaBoardDay(){return '2026-11-17';}`,
   '@/lib/live-model-forecast':`export async function attachFittedResearchForecasts(){throw Error('No refitting in outage handler');}`
  };
  const b=await rolldown({input:join(dir,'entry.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'handler-input-faults',resolveId(id){if(mocks[id])return '\0'+id;if(id==='next/server')return resolve('tests/fixtures/ranking-framework.mjs');if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts');},load(id){if(id.startsWith('\0'))return mocks[id.slice(1)];}}]});await b.write({file:join(dir,'worker.mjs'),format:'esm'});await b.close();
  mf=new Miniflare(convertV4MiniflareOptions({modules:true,modulesRoot:dir,scriptPath:join(dir,'worker.mjs'),compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],outboundService:()=>{throw Error('No production access permitted');}}));
  for(const market of markets){const r=await mf.dispatchFetch('https://test/api/nba/rankings?market='+market),d=await r.json();assert.equal(r.status,503,market);assert.equal(d.success,false);assert.equal(d.reason,'nba_official_history_unavailable');assert.equal(d.dataState,'unavailable');assert.ok(d.error);assert.equal(r.headers.get('Retry-After'),'60');const empty=await mf.dispatchFetch('https://test/api/nba/rankings?market='+market+'&empty=1');assert.equal(empty.status,200,market);}
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
