import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';
const code=ts.transpileModule(await readFile(new URL('../app/api/history/performance/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
test('saved CFB HTTP response retains board quote, projection, rank and observed final zero',async()=>{
 const original={playerId:'p',gameId:'g',market:'passing_yards',gameTime:'2026-11-04T23:00Z',sportsbookLine:null,modelProjection:999,status:'miss',actual:0};
 const saved={...original,key:'p|g|passing_yards',sportsbookLine:undefined,line:130.5,projection:125,projectionBasis:'historical_baseline',quoteEvidence:true,rank:3,status:'pending'};
 const mocks={
  '@/lib/cfb-saved-boards':{readCfbSavedBoards:async()=>[saved]},'@/lib/performance-response-scope':{performanceResponseScope:r=>[...r]},
  '@/lib/saved-projection':{recordedProjectionValue:r=>r.projection??r.modelProjection},'@/lib/prediction-probability':{predictionAccuracy:()=>({}),predictionProbability:()=>null},
  '@/lib/performance-view':{performanceView:async()=>({records:[original],coverage:{complete:false}})},'@/lib/performance-recovery-scheduler':{schedulePerformanceRecovery:()=>{}},
  '@/lib/dashboard-contract':{dashboardDay:()=> '2026-11-04'},'@/lib/saved-performance':{HISTORY_SPORTS:['cfb'],HISTORY_PERIODS:['Today'],savedHistorySummary:()=>({}),historyGroup:()=>''},
  'next/server':{NextResponse:{json:body=>body}}
 };
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n],Date,Map,Set});
 const result=await module.exports.GET({nextUrl:new URL('https://test/api/history/performance?sport=cfb&period=Today&includeBoards=true')});
 assert.equal(result.records.length,1);const r=result.records[0];assert.equal(r.line,130.5);assert.equal(r.projection,125);assert.equal(r.actual,0);assert.equal(r.status,'miss');assert.equal(r.rank,3);assert.equal(original.modelProjection,999);
});
