import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
const source=await readFile(new URL('../app/api/top-plays/route.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const sports=['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb'];
function load(stage){
 let saves=0,updates=0;const exports={};
 const modules={
  '@/lib/estimated-ev':{estimatedEv:()=>null},
  '@/lib/featured-history-corrections':{reportedFeaturedOriginal:()=>null},
  '@/lib/top-plays':{distinctFeaturedPlayers:x=>x},
  '@/lib/retained-top-plays':{retainedTopPlays:()=>[]},
  '@/lib/history-archive':{readHistorySnapshots:async()=>[]},
  '@/lib/featured-selection-capture':{saveFeaturedSelections:async()=>{saves++;throw Error('storage unavailable');}},
  'next/server':{after:()=>{},NextResponse:{json:(body,options)=>({body,...options})}},
  '@/lib/dashboard-contract':{DASHBOARD_SPORTS:sports,dashboardDay:()=> '2026-10-30'},
  '@/lib/durable-history':{readDurableHistoryBatch:async(s,streams,day,options)=>{assert.equal(options.requireComplete,true);if(stage==='hydrate')throw Error('storage unavailable');return []; }},
  '@/lib/top-plays-store':{updateTopPlayMarket:()=>{updates++},topPlayMarketRows:()=>[],topPlayMarketState:()=>({slateDay:stage==='next'?'2026-10-31':'2026-10-30',plays:[{key:'long',pick:{row:{playerId:'new',gameTime:'2026-10-30T20:00Z'}}}]})},
  '@/lib/featured-originals':{FEATURED_STREAMS:['featured_selections'],mergeFeaturedOriginals:()=>[],readFeaturedOriginals:async()=>{throw Error('storage unavailable');}}
 };
 for(const [path,key] of [['nba','NBA'],['nfl','NFL'],['cfb','CFB'],['nhl','NHL'],['cbb','CBB'],['wnba','WNBA'],['soccer','SOCCER']])modules['@/lib/'+path]={[key+'_MARKETS']:[['points']]};
 modules['@/lib/mlb']={BATTER_MARKETS:[['hits']],PITCHER_MARKETS:[['strikeouts']]};
 vm.runInNewContext(code,{exports,require:name=>{assert.ok(modules[name],name);return modules[name]},Date,Set});
 return {get:exports.GET,counts:()=>({saves,updates})};
}
for(const stage of ['hydrate','next','save'])test(stage+' storage failure returns retryable unavailability rather than confirmed empty or replacement cards',async()=>{
 for(const sport of sports){
  const route=load(stage),response=await route.get({nextUrl:new URL('https://test.invalid/api/top-plays?sport='+sport)});
  assert.equal(response.status,503);assert.equal(response.body.success,false);assert.equal(response.body.plays,undefined);
  assert.equal(response.headers['Cache-Control'],'no-store');
  assert.equal(route.counts().saves,stage==='save'?1:0);
 }
});
