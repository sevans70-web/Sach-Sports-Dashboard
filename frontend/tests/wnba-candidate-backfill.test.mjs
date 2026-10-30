import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';import vm from 'node:vm';import {loadTs} from './load-ts.mjs';
const eligibility=await loadTs(new URL('../lib/ranking-availability.ts',import.meta.url));
test('WNBA checks all candidates before selecting 25 and retains the original frozen board',async()=>{
 const fixture={gameId:'g',awayAbbr:'A',homeAbbr:'B',awayTeamId:'1',homeTeamId:'2',tipoff:new Date(Date.now()+86400000).toISOString(),state:'pre'};
 const players=Array.from({length:40},(_,i)=>({playerId:String(i),playerName:'Player '+i,team:'A',gamesPlayed:30}));
 let frozen=null,seenGames=[];
 const mocks={
  '@/lib/ranking-availability':eligibility,
  '@/lib/basketball-pregame-context':{attachBasketballPregameContext:async p=>({...p,rows:p.rows.map(r=>({...r,availabilityEvidence:Number(r.playerId)<5?{code:'official_injury_status',text:'Reported Out',gameId:r.gameId}:undefined}))})},
  '@/lib/live-model-forecast':{attachFittedResearchForecasts:p=>p},'@/lib/saved-model-pick':{prioritizeModelPicks:r=>r},
  '@/lib/ranking-response-cache':{rankingResponse:async(k,build)=>build()},
  '@/lib/nba-slate-board':{frozenNbaSlateBoard:async(m,g)=>{seenGames=g;return frozen},savePregameNbaSlateBoard:async p=>p},
  '@/lib/main-market-quotes':{mainMarketQuotes:p=>p.rows||[],quoteMatchesFixture:()=>true},
  '@/lib/football-book-quotes':{footballQuoteFields:()=>({})},'@/lib/prop-integrity':{guardRankingPayload:p=>p},
  '@/lib/active-ranking-slate':{activeRankingSlate:g=>g},
  '@/lib/wnba':{cleanWnbaName:s=>s.toLowerCase(),playerBaseline:()=>12,wnbaHeadshot:()=>''},
  '@/lib/wnba-history':{saveWnbaPredictions:async()=>true},'@/lib/research-capture':{},'@/lib/owls-provider':{},'@/lib/provider-fetch':{}
 };
 const code=ts.transpileModule(await readFile(new URL('../lib/wnba-rankings-server.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n],Date,Intl,console});
 const overview={games:[fixture],players,season:'2027'};
 for(const rows of [[],players.map(p=>({playerName:p.playerName,gameTime:fixture.tipoff,line:10.5}))]){
  const board=await module.exports.buildWnbaMarketRankings('points',{overview,payload:{rows}});
  assert.equal(board.rows.length,25);assert.equal(board.rows[0].playerId,'5');assert.equal(board.rows[24].playerId,'29');assert.equal(board.rows[24].rank,25);
 }
 frozen={boardFrozen:true,rows:[{playerId:'0',rank:1}]};
 assert.equal(await module.exports.buildWnbaMarketRankings('points',{overview,payload:{rows:[]}}),frozen);
 overview.games=[{...fixture,gameId:'finished-prior',tipoff:new Date(Date.now()-24*3600000).toISOString(),state:'post'},{...fixture,gameId:'live-prior',tipoff:new Date(Date.now()-24*3600000).toISOString(),state:'in'},{...fixture,gameId:'today',tipoff:new Date(Date.now()+3600000).toISOString(),state:'pre'}];
 assert.equal(await module.exports.buildWnbaMarketRankings('points',{overview,payload:{rows:[]}}),frozen);
 assert.ok(seenGames.some(g=>g.gameId==='finished-prior'));assert.ok(seenGames.some(g=>g.gameId==='live-prior'));

});
