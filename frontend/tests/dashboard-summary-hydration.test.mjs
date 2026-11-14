import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';import {loadTs} from './load-ts.mjs';
const response=await loadTs(new URL('../lib/dashboard-response-state.ts',import.meta.url)),contract=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
const code=ts.transpileModule(await readFile(new URL('../components/use-dashboard-summary.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function hook(browser,sport='nba'){
 const now=Date.now(),data={slateDay:contract.dashboardDay(new Date(now)),scheduleAvailable:true,success:true,games:14,previewGames:[],updatedAt:new Date(now).toISOString()},effects=[],updates=[];
 const modules={'react':{useState:initial=>[typeof initial==='function'?initial():initial,s=>updates.push(s)],useEffect:fn=>effects.push(fn)},'@/lib/dashboard-response-state':response,'@/lib/dashboard-contract':contract,'@/lib/visible-polling':{visiblePolling:()=>()=>{}}};
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:id=>modules[id],Date,AbortSignal,fetch:()=>new Promise(()=>{}),...(browser?{window:{sessionStorage:{getItem:()=>JSON.stringify({at:now,data}),setItem(){}}}}:{})});
 const initial=module.exports.useDashboardSummary(sport);return {initial,effects,updates,data};
}
test('server and initial client renders remain identical even with a populated browser summary cache',()=>{
 for(const sport of ['nba','nfl','nhl']){const server=hook(false,sport),client=hook(true,sport);assert.equal(server.initial.data,null);assert.equal(client.initial.data,null);assert.equal(client.initial.at,0);assert.deepEqual(JSON.parse(JSON.stringify(server.initial)),JSON.parse(JSON.stringify(client.initial)));
 const stop=client.effects[0]();assert.equal(client.updates[0].data.games,14);assert.equal(client.updates[0].data.slateDay,client.data.slateDay);stop();}
});
