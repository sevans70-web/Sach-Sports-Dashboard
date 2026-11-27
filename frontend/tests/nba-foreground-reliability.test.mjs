import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {loadTs} from './load-ts.mjs';
import {runJobBudget} from '../jobs/budget.mjs';

const {loadNbaGames}=await loadTs(new URL('../lib/nba.ts',import.meta.url));
const {nbaSourceFetch}=await loadTs(new URL('../lib/nba-source-fetch.ts',import.meta.url));
const {runNbaRankingWork}=await loadTs(new URL('../lib/nba-ranking-work.ts',import.meta.url));
const {data}=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nba-summary-scoreboards-2026-11-15.json.gz',import.meta.url))));
const scoreboard='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';

test('NBA cold scoreboard is bounded, short-lived and fails closed on malformed or denied input',async()=>{
 const native=globalThis.fetch,OriginalDate=Date;
 let now=Date.parse('2026-11-15T15:52:00Z'),active=0,peak=0,calls=0,mode='recorded';
 globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}};
 globalThis.fetch=async(input,options)=>{
  const url=new URL(input instanceof Request?input.url:input);
  assert.equal(url.origin,'https://site.api.espn.com');
  assert.equal(url.href.split('?')[0],scoreboard);
  assert.equal(options.redirect,'manual');
  calls++;active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,4));
  active--;
  if(mode==='denied')return new Response(null,{status:403});
  if(mode==='empty')return Response.json({events:[]});
  if(mode==='malformed'&&url.searchParams.get('dates')==='20261115')return Response.json({events:[{id:'broken'}]});
  return Response.json(data[url.searchParams.get('dates')]??{events:[]});
 };
 try{
  const original=await loadNbaGames(false);
  assert.ok(original.length>0);
  assert.equal(new Set(original.map(game=>game.gameId)).size,original.length);
  assert.ok(peak<=4);
  const reads=calls;
  now+=10000;
  assert.deepEqual(await loadNbaGames(false),original);
  assert.equal(calls,reads);

  now+=31000;mode='malformed';
  await assert.rejects(loadNbaGames(false),/schedule incomplete/);
  mode='recorded';
  assert.deepEqual(await loadNbaGames(false),original,'failed inputs are not cached');

  now+=31000;mode='denied';
  await assert.rejects(loadNbaGames(false),/schedule incomplete/);
  mode='empty';
  assert.deepEqual(await loadNbaGames(false),[]);
 }finally{globalThis.fetch=native;globalThis.Date=OriginalDate;}
});

test('NBA never follows redirects in either foreground or job context',async()=>{
 const native=globalThis.fetch,previous=globalThis.__sachDashboardJobContext;
 const calls=[];
 globalThis.fetch=async(input,options)=>{
  calls.push([String(input),options?.redirect]);
  return new Response(null,{status:302,headers:{location:'https://site.web.api.espn.com/redirect-target'}});
 };
 try{
  await assert.rejects(nbaSourceFetch(scoreboard,()=>assert.fail('redirect cannot become evidence')),/official_source_redirect_rejected/);
  await assert.rejects(runJobBudget({env:{},store:{},gate:async()=>0},
    ()=>nbaSourceFetch(scoreboard,()=>assert.fail('redirect cannot become evidence'))),/official_source_redirect_rejected/);
  assert.deepEqual(calls,[[scoreboard,'manual'],[scoreboard,'manual']]);
 }finally{globalThis.fetch=native;globalThis.__sachDashboardJobContext=previous;}
});

test('a late cancelled fetch cannot validate evidence or release an ongoing ranking slot early',async()=>{
 const native=globalThis.fetch;
 let resolveResponse,started,requestSignal;
 const pending=new Promise(resolve=>{resolveResponse=resolve;}),called=new Promise(resolve=>{started=resolve;});
 globalThis.fetch=async(_url,{signal})=>{requestSignal=signal;started();return pending;};
 const caller=new AbortController();
 try{
  const work=runNbaRankingWork(()=>nbaSourceFetch(scoreboard,()=>assert.fail('cancelled evidence must be discarded')),caller.signal);
  const rejection=assert.rejects(work,/fixture cancelled/);
  await called;
  let nextStarted=false;
  const next=runNbaRankingWork(async()=>{nextStarted=true;return 'next';});
  caller.abort(Error('fixture cancelled'));
  await rejection;
  assert.equal(requestSignal.aborted,true);
  assert.equal(nextStarted,false);
  resolveResponse(Response.json({events:[]}));
  assert.equal(await next,'next');
 }finally{globalThis.fetch=native;}
});

test('a scheduled NBA read neither joins nor populates the foreground scoreboard cache',async()=>{
 const native=globalThis.fetch,previous=globalThis.__sachDashboardJobContext;
 const OriginalDate=Date,at=Date.parse('2026-11-16T14:00:00Z');let calls=0;
 globalThis.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}};
 globalThis.fetch=async input=>{
  calls++;
  const url=new URL(input instanceof Request?input.url:input);
  return Response.json(data[url.searchParams.get('dates')]??{events:[]});
 };
 try{
  const foreground=await loadNbaGames(false);
  const reads=calls;
  const job=await runJobBudget({env:{},store:{},gate:async()=>0},()=>loadNbaGames(false));
  assert.deepEqual(job.result,foreground);
  assert.ok(calls>=reads+8);
  const afterJob=calls;
  assert.deepEqual(await loadNbaGames(false),foreground);
  assert.equal(calls,afterJob);
 }finally{globalThis.fetch=native;globalThis.__sachDashboardJobContext=previous;globalThis.Date=OriginalDate;}
});
