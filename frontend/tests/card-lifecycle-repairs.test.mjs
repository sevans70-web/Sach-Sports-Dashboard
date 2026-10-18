import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballObservedRows}=await loadTs(new URL('../lib/football-observed-stats.ts',import.meta.url));
const {researchFinalOutcome,cardObservedProgress,scorerTarget}=await loadTs(new URL('../lib/card-results.ts',import.meta.url));
const {playableSlateOrder}=await loadTs(new URL('../lib/ranking-card-state.ts',import.meta.url));
const {trackRankBoard}=await loadTs(new URL('../lib/rank-movement.ts',import.meta.url));
const athlete=(id,name,stats)=>({athlete:{id,displayName:name},stats});
test('Spears regression: live football feed supplies explicit receiving yards and catches, including reported zero',()=>{
 const d={boxscore:{players:[{team:{abbreviation:'TEN'},statistics:[{name:'receiving',labels:['REC','YDS','TD'],athletes:[athlete('4428557','Tyjae Spears',['1','7','0']),athlete('zero','Zero',['0','0','0'])]},{name:'rushing',labels:['CAR','YDS','TD'],athletes:[athlete('4428557','Tyjae Spears',['1','1','0'])]}]}]}};
 const r=footballObservedRows(d);assert.equal(r[0].stats.receiving_yards,7);assert.equal(r[0].stats.receptions,1);assert.equal(r[0].stats.anytime_td,0);assert.equal(r[0].stats.rushing_receiving_yards,8);assert.equal(r[1].stats.receiving_yards,0);assert.equal(r.find(p=>p.playerId==='absent'),undefined);
});
test('football stats preserve unknown categories, negative rushing and separate passing TDs from scorer TDs',()=>{
 const rows=footballObservedRows({boxscore:{players:[{statistics:[{name:'passing',labels:['C/ATT','YDS','TD'],athletes:[athlete('qb','QB',['0/2','0','2'])]},{name:'rushing',labels:['CAR','YDS','TD'],athletes:[athlete('rb','RB',['2','-3','0'])]}]}]}});
 assert.equal(rows[0].stats.pass_completions,0);assert.equal(rows[0].stats.pass_attempts,2);assert.equal(rows[0].stats.anytime_td,null);assert.equal(rows[0].stats.receiving_yards,undefined);assert.equal(rows[0].stats.q1_passing_yards,undefined);assert.equal(rows[1].stats.rushing_yards,-3);
});
test('zero missing-category totals require a participating player and a fully reconciled official table',()=>{
 const summary=(totals)=>({boxscore:{players:[{statistics:[{name:'rushing',labels:['CAR','YDS','TD'],athletes:[athlete('rb','RB',['1','5','0'])]},{name:'receiving',labels:['REC','YDS','TD'],totals,athletes:[athlete('wr','WR',['1','10','0'])]}]}]}});
 const complete=footballObservedRows(summary(['1','10','0'])).find(r=>r.playerId==='rb');assert.equal(complete.stats.receiving_yards,0);assert.equal(complete.stats.anytime_td,0);assert.equal(complete.stats.rushing_receiving_yards,5);
 const incomplete=footballObservedRows(summary(['2','20','0'])).find(r=>r.playerId==='rb');assert.equal(incomplete.stats.receiving_yards,undefined);
 assert.equal(footballObservedRows(summary(undefined)).find(r=>r.playerId==='rb').stats.anytime_td,null);
});
test('Hutchinson original saved research OVER gets a research X, without inventing a validated betting pick',()=>{
 const row={quoteVerified:true,frozen:true,originalResearchPick:'OVER',originalResearchSavedAt:'2026-10-18T03:10:34Z',gameTime:'2026-10-18T13:30:00Z'};
 const r=researchFinalOutcome(row,10,14.5,'receiving_yards');assert.match(r.label,/❌ RESEARCH OVER MISSED/);assert.match(r.detail,/excluded from betting performance/);
 assert.match(researchFinalOutcome({...row,originalResearchPick:'UNDER'},10,14.5,'receiving_yards').label,/✅ RESEARCH UNDER MET/);
 assert.equal(researchFinalOutcome({...row,originalResearchPick:null},10,14.5,'receiving_yards').label,'FINISHED BELOW LINE');
 assert.equal(researchFinalOutcome({...row,originalResearchSavedAt:'2026-10-18T14:00Z'},10,14.5,'receiving_yards').label,'FINISHED BELOW LINE');
 assert.equal(researchFinalOutcome({...row,quoteVerified:false},10,null,'receiving_yards').label,'FINAL · ACTUAL RECORDED');
});
test('anytime TD means target 1+, with a count-based progress bar instead of YES or a probability',()=>{
 assert.equal(scorerTarget('anytime_td'),'1+ TD');assert.equal(scorerTarget('first_td'),'First TD scorer');
 assert.equal(cardObservedProgress(0,.5,'anytime_td').percent,0);assert.equal(cardObservedProgress(1,.5,'anytime_td').percent,100);assert.equal(cardObservedProgress(2,.5,'anytime_td').actual,2);
 assert.equal(cardObservedProgress(null,.5,'anytime_td'),null);assert.equal(cardObservedProgress(7,null,'receiving_yards'),null);
});
test('every sport puts final games below live and upcoming games, preserving final cards rather than deleting them',()=>{
 for(const sport of ['nfl','cfb','nba','wnba','cbb','nhl']){
  const rows=[{sport,id:'morning',date:'2026-10-18T13:30Z',state:'post'},{sport,id:'later',date:'2026-10-18T20:00Z',state:'pre'},{sport,id:'live',date:'2026-10-18T17:00Z',state:'in'}];
  assert.deepEqual(playableSlateOrder(rows).map(r=>r.id),['live','later','morning']);assert.equal(rows[0].id,'morning');
 }
});
test('first board establishes a baseline; only entrants into a previously observed board are NEW',()=>{
 const a=trackRankBoard([{playerId:1,gameId:'A',rank:1}],null,'scope');assert.equal(a.rows[0].movement,'same');
 const b=trackRankBoard([...a.rows,{playerId:2,gameId:'B',rank:2}],a.board,'scope');assert.equal(b.rows[1].movement,'new');assert.equal(b.rows[0].movement,'same');
});
test('rushing TDs leaves the active catalog while its historical market definition is preserved',async()=>{
 const {NFL_ACTIVE_MARKETS,NFL_MARKETS}=await loadTs(new URL('../lib/nfl.ts',import.meta.url));
 assert.equal(NFL_ACTIVE_MARKETS.some(m=>m[0]==='rushing_tds'),false);assert.equal(NFL_MARKETS.some(m=>m[0]==='rushing_tds'),true);
});
