import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import vm from 'node:vm';import ts from 'typescript';import {loadTs} from './load-ts.mjs';
const window=await loadTs(new URL('../lib/nba-board-window.ts',import.meta.url));
const scope=await loadTs(new URL('../lib/nba-slate-scope.ts',import.meta.url));
const code=ts.transpileModule(await readFile(new URL('../app/api/nba/rankings/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
for(const at of ['2026-11-01T04:30Z','2026-03-08T06:30Z','2026-11-01T07:30Z'])test('NBA failed refresh at '+at+' retains the original live slate and respects explicit calendar requests',async()=>{
 const now=Date.parse(at),dates=window.nbaBoardDates(new Date(now)),reads=[];
 const rows=[{playerId:'1',gameId:'old',market:'points',gameTime:dates.previous+'T23:00Z',rank:1,sportsbookLine:20.5,overPrice:-110,underPrice:-115,quoteId:'original',researchForecast:{projection:24.2}}, {playerId:'2',gameId:'late',market:'points',gameTime:dates.previous+'T23:00Z',rank:2,sportsbookLine:12.5,overPrice:120}];
 const board={market:'points',day:dates.previous,capturedAt:dates.previous+'T22:00Z',lockAt:dates.previous+'T23:00Z',rows};
 const mocks={
  '@/lib/nba-slate-scope':scope,'@/lib/nba-board-window':{...window,nbaBoardDates:()=>dates,activeNbaBoardDay:g=>window.activeNbaBoardDay(g,new Date(now))},
  '@/lib/nba-slate-board':{currentNbaPregameSnapshot:()=>null,readNbaSlateBoard:async()=>null},
  '@/lib/basketball-pregame-context':{},'@/lib/prop-integrity':{},
  '@/lib/nba':{NBA_MARKETS:[['points']],loadNbaGames:async()=>[{gameId:'old',tipoff:rows[0].gameTime,state:'post'},{gameId:'late',tipoff:rows[1].gameTime,state:'in'},{gameId:'today',tipoff:dates.today+'T23:00Z',state:'pre'}]},
  '@/lib/nba-rankings-server':{buildNbaMarketRankings:async()=>{throw Error('provider timeout')}},
  '@/lib/durable-history':{readDurableHistory:async(s,m,d)=>{reads.push(d);return d===dates.previous?[board]:[]}},
  'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status||200})}}
 };
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]))}static now(){return now}}
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n],Date:Clock,console,setTimeout,clearTimeout});
 const response=await module.exports.GET({nextUrl:new URL('https://test/api/nba/rankings?market=points')});
 assert.equal(response.status,200);assert.equal(response.body.boardDay,dates.previous);assert.equal(response.body.boardFrozen,true);
 for(let i=0;i<rows.length;i++)for(const key of ['playerId','gameId','rank','sportsbookLine','overPrice','underPrice','quoteId','researchForecast'])assert.deepEqual(response.body.rows[i][key],rows[i][key]);
 assert.deepEqual(reads,[dates.previous]);
 const today=await module.exports.GET({nextUrl:new URL('https://test/api/nba/rankings?market=points&day=today')});assert.equal(today.status,503);assert.equal(reads.at(-1),dates.today);
});
