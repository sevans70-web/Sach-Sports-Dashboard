import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';import {loadTs} from './load-ts.mjs';
const {loadCbbGames}=await loadTs(new URL('../lib/cbb.ts',import.meta.url));
const shifted=days=>new Date(Date.now()+days*86400000);
const event=(id,date)=>({id,date,status:{type:{state:'pre'}},competitions:[{competitors:[{homeAway:'away',team:{id:'a',displayName:'Away'}},{homeAway:'home',team:{id:'h',displayName:'Home'}}]}]});
function reset(){const s=globalThis.__sachProviderTransportV2;if(s){s.cache.clear();s.pending.clear();s.bytes=0;}}
test('current CBB reads eight daily boards; the explicit calendar retains all 48',async()=>{
 const old=globalThis.fetch;let calls=0;reset();globalThis.fetch=async()=>{calls++;return Response.json({events:[event('next',shifted(1).toISOString())]});};
 try{assert.equal((await loadCbbGames(false))[0].gameId,'next');assert.equal(calls,8);reset();calls=0;await loadCbbGames(true);assert.equal(calls,48);}finally{globalThis.fetch=old;reset();}
});
test('current CBB fallback discovers a later slate without repeating the first eight provider reads',async()=>{
 const old=globalThis.fetch;let calls=0;reset();const date=shifted(20),key=date.toISOString().slice(0,10).replaceAll('-','');
 globalThis.fetch=async url=>{calls++;return Response.json({events:new URL(String(url)).searchParams.get('dates')===key?[event('later',date.toISOString())]:[]});};
 try{assert.equal((await loadCbbGames(false))[0].gameId,'later');assert.equal(calls,48);}finally{globalThis.fetch=old;reset();}
});
const schedule=await loadTs(new URL('../lib/schedule-payloads.ts',import.meta.url));
const code=ts.transpileModule(await readFile(new URL('../app/api/game-slate/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
test('NBA and CBB schedule enrichment fetches only live games in the selected window',async()=>{
 for(const sport of ['nba','cbb']){
  const calls=[],flags=[],module={exports:{}};
  const games=[{gameId:'old',state:'post'},{gameId:'final',state:'post'},{gameId:'live',state:'in'},{gameId:'next',state:'pre'}].map(g=>({...g,tipoff:shifted(0).toISOString()}));
  const load=async calendar=>{flags.push(calendar);return games;};
  const mocks={'@/lib/schedule-payloads':schedule,'@/lib/provider-fetch':{providerFetch:async url=>{calls.push(url);return Response.json({header:{status:{period:1,displayClock:'9:00',type:{}}}});}},'next/server':{NextResponse:{json:data=>data}},'@/lib/nba':{loadNbaGames:load},'@/lib/cbb':{loadCbbGames:load},'@/lib/wnba':{},'@/lib/nhl':{},'@/lib/nfl-server':{},'@/lib/dashboard-contract':{dashboardSlate:rows=>rows.filter(r=>r.id!=='old')},'@/lib/ranking-card-state':{playableSlateOrder:rows=>rows}};
  vm.runInNewContext(code,{module,exports:module.exports,require:id=>{if(!(id in mocks))throw Error(id);return mocks[id];},URL,Date,Intl,console,Map,Set});
  const result=await module.exports.GET({nextUrl:new URL('https://test/api/game-slate?sport='+sport)});
  assert.equal(result.success,true);assert.deepEqual(flags,[false]);assert.equal(calls.length,1);assert.ok(calls[0].endsWith('event=live'));assert.deepEqual(Array.from(result.games,r=>r.id),['final','live','next']);
 }
});
