import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import ts from 'typescript';import vm from 'node:vm';import {loadTs} from './load-ts.mjs';
const fixtureMatching=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const eligibility=await loadTs(new URL('../lib/ranking-availability.ts',import.meta.url));
test('NHL applies saved availability before pregame Top25, rejects skaters for goalie saves, and retains started limits',async()=>{
 const game={gameId:'g',tipoff:new Date(Date.now()+3600000).toISOString(),state:'pre',awayAbbr:'A',homeAbbr:'B',awayTeam:'Away',homeTeam:'Home',season:'20262027'};
 const players=Array.from({length:40},(_,i)=>({playerId:String(i+1),playerName:'Player '+i,team:'A',position:'G',gamesPlayed:30}));let quotes=[],unavailable=true;
 const mocks={
  '@/lib/ranking-availability':eligibility,'@/lib/live-model-forecast':{attachFittedResearchForecasts:p=>p},
  '@/lib/sgo-supplement':{getSgoSupplement:async()=>null,sgoBookGames:()=>[]},
  '@/lib/saved-model-pick':{prioritizeModelPicks:r=>r},'@/lib/ranking-response-cache':{rankingResponse:async(k,f)=>f()},
  '@/lib/record-notes':{recordNoteFields:p=>({injuryStatus:p.injuryStatus})},
  '@/lib/main-market-quotes':{...fixtureMatching,mainMarketQuotes:()=>quotes,quoteMatchesFixture:()=>true},
  '@/lib/football-book-quotes':{footballQuoteFields:()=>({})},'@/lib/prop-integrity':{guardRankingPayload:p=>p},
  '@/lib/owls-provider':{getOwlsPayload:async()=>({data:[]})},'@/lib/unique-ranking-rows':{uniqueRankingRows:r=>r},
  '@/lib/nba-game-match':{nbaPropMatchesGame:()=>true},'@/lib/provider-fetch':{},'@/lib/research-capture':{},
  '@/lib/nhl':{loadNhlOverview:async()=>({players,games:[game],season:'baseline'}),cleanNhlName:s=>s.toLowerCase(),nhlHeadshot:()=>'',playerBaseline:()=>10},
  '@/lib/active-ranking-slate':{activeRankingSlate:g=>g},
  '@/lib/nhl-history':{saveNhlSlate:async()=>({predictions:unavailable?players.slice(0,5).map(p=>({...p,gameId:'g',injuryStatus:'Out',gameTime:game.tipoff})):[]})}
 };
 const code=ts.transpileModule(await readFile(new URL('../lib/nhl-rankings-server.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:n=>mocks[n],Date,console});
 let board=await module.exports.buildNhlRankings('goalie_saves');assert.equal(board.rows.length,25);assert.equal(board.rows[0].playerId,'6');assert.equal(board.rows[24].playerId,'30');
 unavailable=false;players[0].position='D';quotes=[{playerName:players[0].playerName,line:20.5}];
 board=await module.exports.buildNhlRankings('goalie_saves');assert.equal(board.rows.length,25);assert.ok(board.rows.every(r=>r.playerId!=='1'));
 game.state='in';game.tipoff=new Date(Date.now()-3600000).toISOString();board=await module.exports.buildNhlRankings('goalie_saves');assert.equal(board.rows.length,25);
});
