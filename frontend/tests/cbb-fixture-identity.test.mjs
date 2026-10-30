import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {cbbFixtureIdentity}=await loadTs(new URL('../lib/cbb-fixture-identity.ts',import.meta.url));
const game={awayAbbr:'CORN',homeAbbr:'MSU',awayTeamId:'172',homeTeamId:'127',season:'2027'};
test('CBB forecast identity binds official home/away team IDs and upcoming fixture season',()=>{
 assert.deepEqual(cbbFixtureIdentity(game,'corn'),{teamId:'172',opponentId:'127',season:'2027'});
 assert.deepEqual(cbbFixtureIdentity(game,'MSU'),{teamId:'127',opponentId:'172',season:'2027'});
});
test('missing, mismatched and ambiguous fixture evidence cannot become an invented model identity',()=>{
 for(const team of ['', 'OTHER'])assert.equal(cbbFixtureIdentity(game,team).teamId,null);
 assert.equal(cbbFixtureIdentity({...game,homeAbbr:'CORN'},'CORN').teamId,null);
 assert.equal(cbbFixtureIdentity({...game,season:null},'CORN').season,null);
 assert.equal(cbbFixtureIdentity(null,'CORN').teamId,null);
});

test('both quoted and unpriced CBB ranking paths pass fixture identity into the forecast layer',async()=>{
 const {readFile}=await import('node:fs/promises'),{default:ts}=await import('typescript'),{default:vm}=await import('node:vm');
 const fixture={...game,gameId:'g',tipoff:new Date(Date.now()+86400000).toISOString(),state:'pre',awayTeam:'Cornell',homeTeam:'Michigan State'};
 const overview={season:'2026',players:[{playerId:123,playerName:'Current player',team:'CORN',gamesPlayed:30}],games:[fixture]};
 const mocks={
  '@/lib/basketball-pregame-context':{attachBasketballPregameContext:async p=>({...p,rows:p.rows.map(r=>({...r,availabilityEvidence:String(r.playerId).startsWith("blocked")?{gameId:r.gameId,code:"official_injury_status",text:"Reported Out"}:undefined}))})},
  '@/lib/ranking-availability':await loadTs(new URL('../lib/ranking-availability.ts',import.meta.url)),
  '@/lib/cbb-fixture-identity':{cbbFixtureIdentity},
  '@/lib/cbb':{cleanCbbName:s=>s.toLowerCase().replaceAll(' ',''),playerBaseline:()=>12,cbbHeadshot:()=>'',CBB_MARKETS:[['points']]},
  '@/lib/main-market-quotes':{...await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url)),mainMarketQuotes:p=>p.rows||[],quoteMatchesFixture:()=>true},
  '@/lib/football-book-quotes':{footballQuoteFields:()=>({})},
  '@/lib/prop-integrity':{guardRankingPayload:p=>p},
  '@/lib/live-model-forecast':{attachFittedResearchForecasts:p=>p},
  '@/lib/active-ranking-slate':{activeRankingSlate:g=>g},
  '@/lib/cbb-history':{saveCbbPredictions:async()=>true},
  '@/lib/owls-provider':{},'@/lib/provider-fetch':{},'@/lib/research-capture':{}
 };
 const code=ts.transpileModule(await readFile(new URL('../lib/cbb-rankings-server.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>mocks[name],Date,Intl,console});
 for(const rows of [[],[{playerName:'Current player',playerTeam:'CORN',matchup:'Cornell @ Michigan State',gameTime:fixture.tipoff,line:10.5}]]){
  const board=await module.exports.buildCbbMarketRankings('points',{overview,payload:{rows}});
  assert.equal(board.success,true);assert.equal(board.rows.length,1);
  assert.equal(board.rows[0].teamId,'172');assert.equal(board.rows[0].opponentId,'127');assert.equal(board.rows[0].season,'2027');
 }
 const players=Array.from({length:40},(_,i)=>({playerId:i<5?'blocked'+i:'eligible'+i,playerName:'Player '+i,team:'CORN',gamesPlayed:30}));
 for(const rows of [[],players.map(p=>({playerName:p.playerName,playerTeam:'CORN',matchup:'Cornell @ Michigan State',gameTime:fixture.tipoff,line:10.5}))]){
  const board=await module.exports.buildCbbMarketRankings('points',{overview:{...overview,players},payload:{rows}});
  assert.equal(board.rows.length,25);assert.equal(board.rows[0].playerId,'eligible5');assert.equal(board.rows[24].playerId,'eligible29');assert.equal(board.rows[24].rank,25);
 }

});
