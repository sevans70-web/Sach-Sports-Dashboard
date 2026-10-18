import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nhlObservedRows,nhlObservedActual,basketballObservedRows}=await loadTs(new URL('../lib/observed-player-stats.ts',import.meta.url));
const {rankingLineProgress,rankingGameForRow}=await loadTs(new URL('../lib/ranking-card-state.ts',import.meta.url));
test('Trevor regression: a research card tracks 49 actual yards toward 228.5 without a pick or probability',()=>{
 const p=rankingLineProgress(49,228.5,'passing_yards');assert.ok(Math.abs(p.percent-21.4442)<.001);assert.equal(p.remaining,179.5);
 assert.equal(rankingLineProgress(0,228.5,'passing_yards').percent,0);
 assert.equal(rankingLineProgress(300,228.5,'passing_yards').percent,100);
 for(const value of [null,undefined,'',NaN,true])assert.equal(rankingLineProgress(value,228.5,'passing_yards'),null);
 for(const line of [null,'',0,-1])assert.equal(rankingLineProgress(49,line,'passing_yards'),null);
 assert.equal(rankingLineProgress(1,1,'first_basket'),null);
});
test('official NHL awayTeam/homeTeam stats, zeroes and goalie save fractions are read consistently',()=>{
 const p={awayTeam:{abbrev:'EDM'},homeTeam:{abbrev:'UTA'},playerByGameStats:{awayTeam:{forwards:[{playerId:1,name:{default:'Player One'},toi:'12:30',sog:0,goals:0,assists:1,blockedShots:2}],goalies:[{playerId:2,toi:'45:00',saveShotsAgainst:'19/22'}]},homeTeam:{defense:[{playerId:3,toi:'09:30',goals:1,assists:1}],goalies:[{playerId:4,toi:'00:00',saves:0}]}}};
 assert.equal(nhlObservedRows(p).length,3);assert.equal(nhlObservedActual(p,'1','shots_on_goal'),0);assert.equal(nhlObservedActual(p,'1','points'),1);assert.equal(nhlObservedActual(p,'2','goalie_saves'),19);assert.equal(nhlObservedActual(p,'3','blocked_shots'),null);assert.equal(nhlObservedActual(p,'4','goalie_saves'),null);assert.equal(nhlObservedActual(p,'99','points'),null);
});
test('basketball observations include independent full-game stats but never divide them to make Q1 values',()=>{
 const p={boxscore:{players:[{team:{abbreviation:'A'},statistics:[{labels:['PTS','REB','AST','3PT'],athletes:[{athlete:{id:'1',displayName:'Player One'},stats:['20','0','5','2-4']},{athlete:{id:'2'},didNotPlay:true,stats:['0','0','0','0-0']}]}]}]}};
 const r=basketballObservedRows(p);assert.equal(r.length,1);assert.equal(r[0].stats.points,20);assert.equal(r[0].stats.rebounds,0);assert.equal(r[0].stats.pts_rebs_asts,25);assert.equal(r[0].stats.threes_made,2);assert.equal(r[0].stats.q1_points,null);assert.equal(r[0].stats.first_basket,null);
});
test('live/final statuses cannot leak from another fixture with the same teams',()=>{
 const games=[{id:'earlier',date:'2026-10-17T20:00:00Z',awayTeam:'A',homeTeam:'B'},{id:'today',date:'2026-10-18T20:00:00Z',awayTeam:'A',homeTeam:'B'}];
 assert.equal(rankingGameForRow({gameId:'today'},games).id,'today');assert.equal(rankingGameForRow({gameId:'missing',gameTime:games[1].date,matchup:'A @ B'},games),null);
 assert.equal(rankingGameForRow({gameTime:games[1].date,matchup:'A @ B'},games).id,'today');assert.equal(rankingGameForRow({matchup:'A @ B'},games),null);
});
