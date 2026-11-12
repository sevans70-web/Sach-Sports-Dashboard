import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';

const {espnPriorMeetings, espnGameComparison, nhlPriorMeetings} =
  await loadTs(new URL('../lib/game-overview-matchup.ts', import.meta.url));

const away = {homeAway:'away', team:{id:'1', abbreviation:'AWY'}, score:'104'};
const home = {homeAway:'home', team:{id:'2', abbreviation:'HME'}, score:'110'};
const date = '2026-11-11T23:00Z';
const game = {id:'selected', date, competitors:[away, home], status:{type:{state:'in'}}};
const summary = {header:{id:game.id, competitions:[game]}};
const prior = {id:'prior', date:'2026-11-03T23:00Z', statusType:{completed:true,state:'post'}, competitors:[home, away]};

test('basketball season series excludes selected, future, unrelated and unfinished fixtures',()=>{
 const result=espnPriorMeetings({...summary,seasonseries:[{events:[
  prior, {...prior,id:game.id}, {...prior,id:'future',date:'2026-11-12T23:00Z'},
  {...prior,id:'live',statusType:{state:'in',completed:false}},
  {...prior,id:'other',competitors:[away,{...home,team:{id:'3'}}]},
 ]}]},[prior]);
 assert.deepEqual(result.map(row=>row.result),['AWY 104 – HME 110']);
});

test('football head to head supports tied games and records the actual home and away scores once',()=>{
 const played={id:'previous',gameDate:'2026-10-11T17:00Z',gameResult:'T',homeTeamId:'1',awayTeamId:'2',homeTeamScore:'27',awayTeamScore:'27'};
 const result=espnPriorMeetings({...summary,lastFiveGames:[{events:[played]},{events:[played]}]});
 assert.deepEqual(result.map(row=>row.result),['HME 27 – AWY 27']);
});

test('NBA live comparison uses confirmed fixture teams and distinguishes missing attempts from a reported zero',()=>{
 const stat = displayValue => [{name:'threePointFieldGoalsMade-threePointFieldGoalsAttempted',displayValue}];
 const teams=[{team:home.team,statistics:stat('4-9')},{team:away.team,statistics:stat('0-3')}];
 assert.equal(espnGameComparison({...summary,boxscore:{teams}},'nba'),'Three-point shooting so far: AWY 0-for-3 · HME 4-for-9.');
 assert.equal(espnGameComparison({...summary,boxscore:{teams:teams.slice(0,1)}},'nba'),'');
});

test('NHL meetings require the same two club IDs and a completed prior regular season or playoff game',()=>{
 const fixture={id:100,startTimeUTC:date,awayTeam:{id:1},homeTeam:{id:2}};
 const played={id:90,startTimeUTC:'2026-10-11T17:00Z',gameType:2,gameState:'OFF',
  awayTeam:{id:2,abbrev:'HME',score:2},homeTeam:{id:1,abbrev:'AWY',score:0}};
 const result=nhlPriorMeetings(fixture,[played,{...played,id:89,gameType:1},{...played,id:91,gameState:'LIVE'}]);
 assert.deepEqual(result.map(row=>row.result),['HME 2 – AWY 0']);
});
