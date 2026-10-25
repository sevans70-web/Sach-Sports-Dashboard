import test from 'node:test';import assert from 'node:assert/strict';import ts from 'typescript';import vm from 'node:vm';import {readFile} from 'node:fs/promises';import {loadTs} from './load-ts.mjs';
const {playerGameObservations}=await loadTs(new URL('../lib/player-game-observations.ts',import.meta.url));
async function load({configured=true,cloudRequest=async()=>[],appendHistorySnapshot=async()=>{},after=()=>{}}={}){
 const source=await readFile(new URL('../lib/player-history-cloud.ts',import.meta.url),'utf8');const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const imports={'next/server':{after,NextResponse:{json:Response.json}},'../scripts/history-cloud.mjs':{cloudConfigured:()=>configured,cloudRequest},'@/lib/history-archive':{appendHistorySnapshot},'@/lib/player-game-observations':{playerGameObservations}};const module={exports:{}};
 vm.runInNewContext(code,{module,exports:module.exports,require:name=>imports[name],console:{warn(){}},AbortSignal});return module.exports.retainPlayerHistory;
}
test('all eight sports return official history after local archival without waiting for failed cloud replication',async()=>{
 const saved=[],deferred=[];let remote=0;
 const retain=await load({appendHistorySnapshot:async(...args)=>saved.push(args),after:work=>deferred.push(work),cloudRequest:async()=>{remote++;throw Error('cloud offline')}});
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
  const response=Response.json({supported:true,points:[{gameId:'g',date:'2026-10-24T01:00Z',value:0}]});assert.equal(await retain(sport,'1','points',response),response);
 }
 assert.equal(saved.length,8);assert.equal(deferred.length,8);assert.equal(remote,0);assert.ok(saved.every(([,stream,payload])=>stream==='player_history_1_points'&&payload.points[0].value===0));
 await Promise.all(deferred.map(work=>work()));assert.equal(remote,8);assert.equal(saved.length,8);
});
test('empty history recovery has a bounded cloud read and preserves the before-date filter',async()=>{
 let options,route;const retain=await load({cloudRequest:async(r,o)=>{route=r;options=o;return [{point:{gameId:'g',date:'2026-10-20',value:4}}]}});
 const response=await retain('nba','1','points',Response.json({supported:true,points:[]}),'2026-10-24T00:00Z');const value=await response.json();assert.equal(value.points[0].value,4);assert.equal(value.historySource,'saved_official_game_logs');assert.ok(options.signal instanceof AbortSignal);assert.ok(route.includes('game_time=lt.2026-10-24T00%3A00%3A00.000Z'));
});
test('local historical preservation remains enabled when cloud configuration is absent',async()=>{
 let local=0,remote=0;const retain=await load({configured:false,appendHistorySnapshot:async()=>local++,cloudRequest:async()=>remote++});const response=Response.json({points:[{gameId:'g',date:'2026-10-20',value:2}]});assert.equal(await retain('nfl','1','sacks',response),response);assert.equal(local,1);assert.equal(remote,0);
});
