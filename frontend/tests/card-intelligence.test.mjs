import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {propIntelligence,gameIntelligence,playerMatchupNotes}=await loadTs(new URL('../lib/card-intelligence.ts',import.meta.url));
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
 const r=guardPerformancePayload({predictions:[{status:'pending'},{status:'hit'},{status:'pending',withdrawnFromBoard:true},{status:'void'}]},'nfl');assert.equal(r.pending,0);assert.equal(r.total,0);assert.deepEqual(r.researchSummary,{total:4,awaitingResult:1,completed:1,hits:1,misses:0,pushes:0,hitRate:100,void:2});assert.equal(r.predictions[0].historicalStatus,'pending');assert.equal(r.predictions[0].status,'research');
});
test('all active sports expose disjoint historical research decisions without certifying a model',()=>{
 for(const sport of ['nfl','cfb','nba','wnba','cbb','nhl']){
 const rows=[{status:'hit'},{status:'miss'},{status:'push'},{status:'pending'},{status:'hit',withdrawnFromBoard:true},{status:'void'}];
 const before=JSON.stringify(rows),r=guardPerformancePayload({predictions:rows},sport);
 assert.deepEqual(r.researchSummary,{total:6,awaitingResult:1,completed:3,hits:1,misses:1,pushes:1,hitRate:50,void:2});
 assert.equal(r.settled,0);assert.equal(r.pending,0);assert.equal(JSON.stringify(rows),before);
 }
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

test('matchup compares prior results for the selected market and omits unsupported injury effects',()=>{
 const row={sport:'nba',gameId:'target',playerId:'player',gameTime:'2026-11-11T23:00:00Z',teamName:'WSH',
  opponentName:'Indiana Pacers',opponentAliases:['IND'],sportsbookLine:14.5,quoteVerified:true,
  teammateAvailability:[{playerName:'Injured teammate',status:'Out',verified:true,gameId:'target'}]};
 const games=[
  {value:12,date:'2026-11-01',opponent:'IND',minutes:24},
  {value:18,date:'2026-11-02',opponent:'Pacers',minutes:30},
  {value:22,date:'2026-11-03',opponent:'Miami Heat',minutes:33},
  {value:99,date:'2026-11-11',opponent:'Indiana Pacers',gameId:'target'},
  {value:100,date:'2026-11-12',opponent:'Indiana Pacers'}
 ];
 const notes=playerMatchupNotes(row,'points',games);
 assert.match(notes[0],/15 points per game across 2 prior meetings.*1 over, 1 under/);
 assert.match(playerMatchupNotes(row,'points',games.slice(1))[0],/One prior meeting.*18 points.*above the recorded 14.5/);
 assert.ok(notes.every(note=>!/99|100|Injured teammate/.test(note)));
 assert.ok(playerMatchupNotes({...row,quoteVerified:false},'points',games).every(note=>!note.includes('recorded 14.5')));
});

test('form distinguishes changes in opportunity from changes in production rate',async()=>{
 const {playerFormInsight}=await loadTs(new URL('../lib/player-card-analysis.ts',import.meta.url));
 const window=(row)=>Array.from({length:5},()=>({...row}));
 const before=window({value:6,minutes:12,fieldGoalAttempts:5});
 const volume=window({value:12,minutes:24,fieldGoalAttempts:10});
 assert.match(playerFormInsight('nba','points',[...before,...volume],'points'),/mainly alongside a change in minutes.*18 vs. 18 points per 36 minutes/);
 assert.match(playerFormInsight('nba','points',[...before,...volume],'points'),/Field-goal attempts per 36 minutes: 15 vs. 15/);
 assert.match(playerFormInsight('nba','points',[...before,...window({value:12,minutes:12})],'points'),/change in output per 36 minutes/);
 assert.match(playerFormInsight('nfl','receptions',[...window({value:2,targets:4}),...window({value:4,targets:8})],'receptions'),/change in targets/);
 assert.match(playerFormInsight('nhl','goals',[...window({value:0,shots:3}),...window({value:1,shots:3})],'goals'),/change in output per shot/);
 assert.match(playerFormInsight('nba','q1_points',[...before,...volume],'points'),/opportunity is incomplete/);
});

test('head-to-head keeps the five latest verified appearances, including zero, before the selected fixture',async()=>{
 const {playerMatchupHistory}=await loadTs(new URL('../lib/card-intelligence.ts',import.meta.url));
 const {playerCardHistory}=await loadTs(new URL('../lib/player-card-history.ts',import.meta.url));
 const history=[
  ...Array.from({length:6},(_,i)=>({gameId:'meeting-'+i,date:`2025-10-0${i+1}`,opponent:'NYG',value:i===5?0:i,period:'q1'})),
  ...Array.from({length:25},(_,i)=>({gameId:'other-'+i,date:`2026-09-${String(i+1).padStart(2,'0')}`,opponent:'PHI',value:20,period:'q1'})),
  {gameId:'repeat',date:'2026-10-03',opponent:'New York Giants',value:44},
  {gameId:'future',date:'2026-11-12',opponent:'NYG',value:99,period:'q1'},
 ];
 const gameTime='2026-11-12T23:00:00Z';
 const points=playerCardHistory({points:history},'nfl','q1_passing_yards',gameTime,'selected',true,200);
 const result=playerMatchupHistory({gameId:'selected',gameTime,opponentName:'New York Giants',opponentAliases:['NYG']},[...points,...points]);
 assert.equal(result.opponent,'New York Giants');
 assert.deepEqual(result.meetings.map(point=>point.value),[1,2,3,4,0]);
});
