import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../app/api/top-plays/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sports=['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'];
function load(stage){
 let saves=0,updates=0,hydrates=0,originalReads=0;const exports={};
 const modules={
  '../../../scripts/history-cloud.mjs':{cloudHistoryReadOnly:()=>false},
  '@/lib/estimated-ev':{estimatedEv:()=>null},
  '@/lib/featured-history-corrections':{reportedFeaturedOriginal:()=>null},
  '@/lib/top-plays':{distinctFeaturedPlayers:x=>x,featuredPlayerKeys:r=>[r.playerId]},
  '@/lib/ranking-board-cache':{readPregameBoard:async()=>null,cachePregameBoard:async()=>{throw Error('Unexpected cache write during outage test')}},
  '@/lib/worker-runtime-secret':{workerRuntimeBinding:()=>undefined},
  '@/lib/retained-top-plays':{retainedTopPlays:()=>[]},
  '@/lib/history-archive':{readHistorySnapshots:async()=>[]},
  '@/lib/featured-selection-capture':{saveFeaturedSelections:async()=>{saves++;throw Error('storage unavailable');}},
  'next/server':{after:()=>{},NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/dashboard-contract':{DASHBOARD_SPORTS:sports,dashboardDay:()=> '2026-10-30'},
  '@/lib/durable-history':{readDurableHistoryBatch:async(s,streams,day,options)=>{hydrates++;assert.equal(options.requireComplete,true);if(stage==='hydrate')throw Error('storage unavailable');return []; }},
  '@/lib/top-plays-store':{updateTopPlayMarket:()=>{updates++},topPlayMarketRows:()=>[{market:'first_td',gameTime:new Date(Date.now()+3600000).toISOString()},{market:'first_goal',gameTime:new Date(Date.now()+3600000).toISOString()}],topPlayMarketState:()=>({slateDay:stage==='next'?'2026-10-31':'2026-10-30',plays:[{key:'play',pick:{row:{playerId:'new',gameTime:(stage==='next'?'2026-10-31':'2026-10-30')+'T20:00Z'}}}]})},
  '@/lib/featured-originals':{FEATURED_STREAMS:['featured_selections'],mergeFeaturedOriginals:()=>[],readFeaturedOriginals:async()=>{originalReads++;throw Error('storage unavailable');}}
 };
 for(const [path,key] of [['nba','NBA'],['nfl','NFL'],['cfb','CFB'],['nhl','NHL'],['cbb','CBB'],['wnba','WNBA'],['soccer','SOCCER']])modules['@/lib/'+path]={[key+'_MARKETS']:[['points']],...(path==='nba'?{loadNbaGames:async()=>[{tipoff:'2026-10-30T20:00Z',state:'post'}]}:{})};
 modules['@/lib/mlb']={BATTER_MARKETS:[['hits']],PITCHER_MARKETS:[['strikeouts']]};
 vm.runInNewContext(code,{exports,require:name=>{assert.ok(modules[name],name);return modules[name]},Date,Set,console:{error(){},warn(){}},setTimeout,clearTimeout});
 return {get:exports.GET,counts:()=>({saves,updates,hydrates,originalReads})};
}
for(const stage of ['hydrate','next','save'])test(stage+' storage failure returns retryable unavailability rather than confirmed empty or replacement cards',async()=>{
 for(const sport of sports){
  const route=load(stage),response=await route.get({nextUrl:new URL('https://test.invalid/api/top-plays?sport='+sport)});
  assert.equal(response.status,503);assert.equal(response.body.success,false);assert.equal(response.body.plays,undefined);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.deepEqual(route.counts(),{saves:stage==='save'?1:0,updates:0,hydrates:1,originalReads:stage==='next'?1:0},sport+' must fail at the intended storage boundary');
 }
});
