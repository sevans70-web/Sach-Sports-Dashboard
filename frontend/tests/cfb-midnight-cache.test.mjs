import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import ts from 'typescript';import vm from 'node:vm';import {loadTs} from './load-ts.mjs';
const nodeRequire=createRequire(import.meta.url),football=await loadTs(new URL('../lib/football-slate-rankings.ts',import.meta.url));
const code=ts.transpileModule(await readFile(new URL('../app/api/cfb/rankings-board/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
for(const [at,prior] of [['2026-11-01T04:30Z','2026-10-31'],['2026-03-08T06:30Z','2026-03-07'],['2026-11-01T07:30Z','2026-10-31']])test('CFB restart at '+at+' reads the prior live slate immediately without rebuilding originals',async()=>{
 const now=Date.parse(at),paths=[],row={playerId:'123',gameId:'g',playerName:'Original',matchup:'A @ B',gameTime:prior+'T23:00Z',market:'passing_yards',marketBacked:true,sportsbookLine:215.5,modelProjection:230,overPrice:110,rank:4};
 const saved={day:prior,market:'passing_yards',slate:'evening',rows:[row],locked:{},updatedAt:prior+'T22:00Z'};
 const mocks={'@/lib/football-slate-rankings':football,'@/lib/cfb-server':{getEspnCfbSchedule:async()=>[{id:'g',date:row.gameTime,state:'in'},{id:'next',date:new Date(now+12*3600000).toISOString(),state:'pre'}]},'node:fs':{promises:{readFile:async p=>{paths.push(String(p));return JSON.stringify(saved)}}}};
 class Clock extends Date{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}}
 const module={exports:{}};vm.runInNewContext(code+'\nbuild=async()=>new Promise(()=>{});module.exports.testPayload=getPayload;',{module,exports:module.exports,require:n=>mocks[n]||(n.startsWith('@/')?{}:nodeRequire(n)),Date:Clock,Intl,process:{env:{}},console,setTimeout,clearTimeout});
 const result=await module.exports.testPayload('passing_yards','evening');
 assert.equal(result.boardDay,prior);assert.equal(result.cached,true);assert.equal(result.stale,true);assert.deepEqual(JSON.parse(JSON.stringify(result.rows)),[row]);assert.ok(paths[0].endsWith(prior+'_passing_yards_evening.json'));
});
