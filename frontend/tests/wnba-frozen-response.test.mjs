import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../app/api/wnba/rankings/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function route(result){
 let fallbackCalls=0,forecastCalls=0;
 const mocks={
  '@/lib/wnba':{WNBA_MARKETS:[['points'],['rebounds'],['assists']],loadWnbaOverview:async()=>{fallbackCalls++;return {games:[],players:[]}}},
  '@/lib/wnba-rankings-server':{buildWnbaMarketRankings:async()=>result},
  '@/lib/prop-integrity':{guardRankingPayload:p=>p},'@/lib/live-model-forecast':{attachFittedResearchForecasts:p=>{forecastCalls++;return p}},
  'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status||200})}}
 };
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n],Date,Intl,console});
 return {get:market=>module.exports.GET({nextUrl:new URL('https://test/api/wnba/rankings?market='+market)}),counts:()=>({fallbackCalls,forecastCalls})};
}
for(const market of ['points','rebounds','assists'])test('WNBA '+market+' preserves empty and populated frozen boards without next-slate substitution or forecast recalculation',async()=>{
 for(const rows of [[],[{playerId:'original',rank:1,quoteId:'q',sportsbookLine:12.5,overPrice:110,researchForecast:{projection:14}}]]){
  const original={success:true,market,boardDay:'2026-10-29',boardFrozen:true,boardUnavailable:rows.length===0,rows};
  const app=route(original),response=await app.get(market);
  assert.equal(response.status,200);assert.equal(response.body,original);assert.deepEqual(app.counts(),{fallbackCalls:0,forecastCalls:0});
 }
});
test('an unfrozen empty WNBA response still attempts its normal next-slate fallback',async()=>{
 const app=route({success:true,market:'points',rows:[]});const response=await app.get('points');assert.equal(response.body.nextSlate,true);assert.equal(app.counts().fallbackCalls,1);
});
