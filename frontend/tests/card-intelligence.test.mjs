import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {propIntelligence,gameIntelligence}=await loadTs(new URL('../lib/card-intelligence.ts',import.meta.url));
const {trackRankBoard}=await loadTs(new URL('../lib/rank-movement.ts',import.meta.url));
const {guardPerformancePayload}=await loadTs(new URL('../lib/prop-integrity.ts',import.meta.url));
test('player research facts use dated included pregame observations, not future or excluded relief outcomes',()=>{
 const row={rank:1,gameTime:'2026-10-18T17:00:00Z',marketLabel:'Passing Yards',quoteVerified:true,sportsbookLine:220.5,modelProjection:250,researchCohort:{excluded:1,observations:[{date:'2026-10-01',value:200,workload:30,included:true},{date:'2026-10-08',value:300,workload:40,included:true},{date:'2026-10-20',value:9999,workload:99,included:true},{date:'2026-10-10',value:0,workload:2,included:false}]}};
 const r=propIntelligence(row,'nfl','passing_yards');assert.match(r.face,/2 qualifying.*200–300/);assert.ok(r.facts.some(f=>f.includes('Average 35 passing attempts')));assert.ok(r.facts.some(f=>f.includes('1 of these 2')));assert.ok(r.facts.every(f=>!f.includes('9999')));assert.match(r.decision,/NO PICK/);assert.match(r.giReason,/withheld/);
});
test('missing quotes and quarter forecasts never produce line comparisons or scaled predictions',()=>{
 const r=propIntelligence({sportsbookLine:10,modelProjection:50,rank:1},'nba','q1_points');assert.ok(r.blockers.includes('Qualifying quote unavailable'));assert.ok(r.blockers.includes('Quarter-specific forecast unvalidated'));assert.ok(r.facts.every(f=>!f.includes('baseline 50')));
});
test('game context describes tied zeroes, score margins, actual records and supplied availability without picking a side',()=>{
 assert.match(gameIntelligence({state:'in',awayScore:0,homeScore:0,awayAbbr:'A',homeAbbr:'B'})[0],/tied 0–0/);
 const r=gameIntelligence({sport:'nhl',state:'post',awayScore:3,homeScore:1,awayAbbr:'A',homeAbbr:'B'},{total:5.5},[{playerName:'P',status:'Out'}]);assert.match(r[0],/won by 2; 4 combined goals/);assert.ok(r.some(f=>f.includes('P (Out)')));assert.ok(gameIntelligence({state:'pre',awayTeam:'A',homeTeam:'B'}).every(f=>!f.includes('Indoor')));
});
test('movement tracks rises, falls, entry, reload persistence and isolated board scopes',()=>{
 const first=trackRankBoard([{playerId:1,gameId:'G',rank:2},{playerId:2,gameId:'G',rank:1}],null,'nfl|passing|today');assert.equal(first.rows[0].movement,'same');
 const next=trackRankBoard([{playerId:1,gameId:'G',rank:1},{playerId:2,gameId:'G',rank:2}],JSON.parse(JSON.stringify(first.board)),'nfl|passing|today');assert.equal(next.rows[0].movement,'up');assert.equal(next.rows[0].previousRank,2);assert.equal(next.rows[1].movement,'down');
 assert.equal(trackRankBoard(next.rows,next.board,'nfl|passing|today').rows[0].movement,'up');assert.equal(trackRankBoard(next.rows,next.board,'nba|points|today').rows[0].movement,'same');assert.equal(trackRankBoard([{playerId:1,gameId:'OTHER',rank:1}],next.board,'nfl|passing|today').rows[0].movement,'new');
});
test('verified pending remains independent of unvalidated historical records and withdrawn snapshots',()=>{
 const r=guardPerformancePayload({predictions:[{status:'pending'},{status:'hit'},{status:'pending',withdrawnFromBoard:true},{status:'void'}]},'nfl');assert.equal(r.pending,0);assert.equal(r.total,0);assert.deepEqual(r.researchSummary,{total:4,awaitingResult:1,completed:1,void:2});assert.equal(r.predictions[0].historicalStatus,'pending');assert.equal(r.predictions[0].status,'research');
});
test('game intelligence never resurrects suppressed quotes, Q1 scaling, heuristic GI or probability from aliases',async()=>{
 const {gameRankingEvidence}=await loadTs(new URL('../lib/card-intelligence.ts',import.meta.url));
 assert.deepEqual(gameRankingEvidence({integrityVersion:1,researchOnly:true,recommendationEligible:false,quoteVerified:false,sportsbookLine:null,modelProjection:null,giScore:null,modelProbability:null,line:45,perGame:60,score:98,probability:90},'q1_points'),{sportsbookLine:null,modelProjection:null,giScore:null,modelProbability:null});
 assert.equal(gameRankingEvidence({integrityVersion:1,researchOnly:true,quoteVerified:true,sportsbookLine:10.5,modelProjection:12},'points').sportsbookLine,10.5);
});
test('game ranking joins reject blank-team and shared-substring leaks and repeated fixtures',async()=>{
 const {gameRankingMatches,gameRankingTeam}=await loadTs(new URL('../lib/card-intelligence.ts',import.meta.url));
 const game={id:'CHI-ATL',date:'2026-10-18T17:00:00Z',awayTeam:'Chicago Bears',awayAbbr:'CHI',awayTeamId:'3',homeTeam:'Atlanta Falcons',homeAbbr:'ATL',homeTeamId:'1'};
 assert.equal(gameRankingMatches({playerName:'Patrick Mahomes',teamName:'',gameId:'KC-LAC'},game),false);
 assert.equal(gameRankingMatches({teamName:''},game),false);
 assert.equal(gameRankingTeam({gameId:game.id,teamName:'Kansas City Chiefs'},'away',game),false);
 assert.equal(gameRankingTeam({gameId:game.id,teamId:'1',teamName:'Atlanta Falcons'},'home',game),true);
 assert.equal(gameRankingTeam({gameId:game.id,teamName:''},'away',game),false);
 assert.equal(gameRankingMatches({teamName:'Atlanta Falcons',gameTime:'2026-10-11T17:00:00Z'},game),false);
});
