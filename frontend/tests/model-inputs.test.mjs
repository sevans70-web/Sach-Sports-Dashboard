import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {footballResearchSample:sample}=await loadTs(new URL('../lib/football-history.ts',import.meta.url));
const {footballBookRows}=await loadTs(new URL('../lib/football-book-quotes.ts',import.meta.url));
const cutoff='2026-10-18T17:00:00Z';
function log(){const rows=[['old','2025-11-01',400,40],['backup','2026-09-01',0,2],['a','2026-09-08',200,25],['b','2026-09-15',250,30],['c','2026-09-22',0,20],['future','2026-11-01',999,60]];return {names:['passingYards','passingAttempts'],events:Object.fromEntries(rows.map(([id,date])=>[id,{gameDate:date}])),seasonTypes:[{categories:[{type:'event',events:rows.map(([eventId,,v,a])=>({eventId,stats:[v,a]}))}]}]}}
test('backup and previous-season games are audited, not blended into passing research; full-workload zero remains',()=>{
 const r=sample(log(),['passingyards'],'passing_yards',cutoff,2026);
 assert.equal(r.games,3);assert.equal(r.projection,116.7);
 assert.equal(r.observations.find(x=>x.eventId==='backup').reason,'limited_passing_role');
 assert.equal(r.observations.find(x=>x.eventId==='old').reason,'previous_season');
 assert.equal(r.observations.find(x=>x.eventId==='future').reason,'not_pregame');
 assert.equal(r.observations.find(x=>x.eventId==='c').included,true);
});
test('missing workload, unknown dates and sparse comparable samples abstain',()=>{
 const p=log();p.names=['passingYards'];assert.equal(sample(p,['passingyards'],'passing_yards',cutoff,2026).projection,null);
 const q=log();q.events={};assert.equal(sample(q,['passingyards'],'passing_yards',cutoff,2026).projection,null);
 assert.equal(sample(log(),['passingyards'],'passing_yards','2026-09-10',2026).projection,null);
});
test('combined stat research requires every component, not a partial invented total',()=>{
 assert.equal(sample(log(),[['passingyards'],['rushingyards']],'passing_rushing_yards',cutoff,2026).projection,null);
});
test('NFL Q1 accepts explicit Q1 base categories, rejects full-game, half and contradictory periods',()=>{
 const now=Date.parse('2026-10-17T12:00:00Z');
 const rows=(category,period)=>footballBookRows({data:[{awayTeam:'A',homeTeam:'B',commenceTime:cutoff,books:[{key:'pinnacle',props:[{playerName:'P',category,period,line:49.5,overPrice:-110,underPrice:-110,lastUpdate:'2026-10-17T11:59:00Z'}]}]}]},'q1_passing_yards',['passing_yards_1q'],now);
 assert.equal(rows('passing_yards','1q').length,1);assert.equal(rows('q1_passing_yards',null).length,1);
 assert.equal(rows('passing_yards',null).length,0);assert.equal(rows('passing_yards','1h').length,0);assert.equal(rows('q1_passing_yards','game').length,0);
});
