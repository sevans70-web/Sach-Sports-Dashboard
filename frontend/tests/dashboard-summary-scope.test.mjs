import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';import {loadTs} from './load-ts.mjs';
const contract=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url)),coverage=await loadTs(new URL('../lib/ranking-market-coverage.ts',import.meta.url)),scope=await loadTs(new URL('../lib/ranking-scope-summary.ts',import.meta.url));
const code=ts.transpileModule(await readFile(new URL('../app/api/dashboard-summary/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const at=Date.parse('2026-11-14T16:00Z');class Clock extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}}
function load(failed=false){
 let modelCalls=0;const market='passing_yards',stamp=new Date(at).toISOString(),row={sport:'nfl',market,playerName:'Test QB',playerId:'p',gameId:'g',gameTime:'2026-11-15T18:00Z',sportsbookLine:200.5,quoteVersion:1,quoteId:'q',sportsbook:'Book',sportsbookKey:'book',lineType:'main',overPrice:100,underPrice:100,quoteUpdatedAt:stamp,boardCapturedAt:stamp,researchForecast:{status:'available',projection:210,calculatedAt:stamp,priceComparison:{overProbability:.6,underProbability:.4,pushProbability:0},modelSelection:{side:'OVER',line:200.5,price:100,quoteId:'q',sportsbookKey:'book',calculatedAt:stamp}}};
 class NextRequest{constructor(url){this.nextUrl=new URL(url)}}
 const modules={
  'next/server':{NextRequest,NextResponse:{json:(body,options={})=>({body,...options})}},
  '../game-slate/route':{GET:async()=>({ok:!failed,json:async()=>failed?{success:false,games:[],error:'Provider unavailable'}:{success:true,games:[{id:'g',date:row.gameTime,state:'pre'}]}})},
  '@/lib/dashboard-contract':contract,'@/lib/ranking-market-coverage':coverage,'@/lib/ranking-scope-summary':scope,
  '@/lib/worker-runtime-secret':{workerRuntimeBinding:()=>undefined},
  '@/lib/durable-history':{readDurableHistoryBatch:async()=>[{stream:'featured_'+market,payload:[{success:true,market,featuredCapturedAt:stamp,rows:[row,row]}]}]},
  '@/lib/nba':{NBA_MARKETS:[['points']]},'@/lib/nfl':{NFL_ACTIVE_MARKETS:[[market],['receiving_yards']]},'@/lib/nhl':{NHL_MARKETS:[['shots_on_goal']]},
 };
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>modules[name]||{GET:()=>{modelCalls++;throw Error('Summary must not launch prediction generation')}},Date:Clock,console});
 return {get:scope=>module.exports.GET(new NextRequest('https://example.test/api/dashboard-summary?sport=nfl&scope='+scope)),modelCalls:()=>modelCalls};
}
test('current scope includes Sunday games on Saturday, reports observed picks and incomplete markets without generating models',async()=>{
 const route=load(),r=await route.get('current');assert.equal(r.status,200);assert.equal(r.body.games,1);assert.equal(r.body.estimatedPicks,1);assert.equal(r.body.coverageComplete,false);assert.equal(r.body.coverageAudit.observedMarkets,1);assert.equal(route.modelCalls(),0);
});
test('explicit Today remains a verified zero on an idle day, separate from current scope',async()=>{
 const route=load(),r=await route.get('today');assert.equal(r.body.games,0);assert.equal(r.body.estimatedPicks,0);assert.equal(r.body.coverageComplete,true);
});
test('schedule outage returns retryable unavailability with unknown counts, never a successful zero',async()=>{
 const r=await load(true).get('current');assert.equal(r.status,503);assert.equal(r.body.scheduleAvailable,false);assert.equal(r.body.games,null);assert.equal(r.body.estimatedPicks,null);
});
