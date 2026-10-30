import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {refreshNbaObservations}=await loadTs(new URL('../lib/live-basketball-observations.ts',import.meta.url));
const now=Date.parse('2026-10-24T12:00:00Z');
const row={playerId:'5144091',season:'2026',pregameContext:{season:'2027'},gameTime:'2026-10-25T00:00Z',gameState:'pre'};
function box(){const labels=['MIN','PTS','FG','3PT','FT','REB','AST','TO','STL','BLK','OREB'];return {header:{id:'401909839',season:{year:2027,type:2},competitions:[{date:'2026-10-22T00:00Z',status:{type:{completed:true}},competitors:[{team:{id:'A'},homeAway:'home',score:'50'},{team:{id:'B'},homeAway:'away',score:'50'}]}]},boxscore:{players:['A','B'].map(team=>({team:{id:team},statistics:[{labels,totals:['','50','20-40','5-10','5-10','25','10','5','5','5','5'],athletes:Array.from({length:5},(_,i)=>({athlete:{id:team==='A'&&i===0?'5144091':team+i,displayName:team+i},starter:true,didNotPlay:false,stats:['48','10','4-8','1-2','1-2','5','2','1','1','1','1']}))}]}))}}}
const log={events:{'401909839':{gameDate:'2026-10-22T00:00Z',gameResult:'W'},'999':{gameDate:'2026-10-23T23:00Z',gameResult:'L'},'888':{gameDate:'2026-10-19T00:00Z',gameResult:'W'}},seasonTypes:[{displayName:'2026-27 Regular Season',categories:[{type:'event',events:[{eventId:'401909839'},{eventId:'401909839'},{eventId:'999'}]}]},{displayName:'2026-27 Preseason',categories:[{type:'event',events:[{eventId:'888'}]}]}]};
test('new-season log supplies complete two-team context, with no preseason, duplicate or <48h result leakage',async()=>{
 const urls=[];const p=await refreshNbaObservations([row],now,async url=>{urls.push(url);return url.includes('/gamelog')?log:box()});
 assert.equal(p.observations.length,60);assert.deepEqual(p.unavailablePlayers,[]);assert.equal(urls.length,2);assert.ok(urls[0].endsWith('season=2027'));
 assert.equal(p.observations.find(r=>r.playerId==='5144091'&&r.market==='points').actual,10);assert.ok(p.observations.some(r=>r.teamId==='B'));assert.equal(p.observations[0].season,'2027');
});
test('failed discovery, incomplete totals and mismatched fixtures withhold affected players',async()=>{
 const unavailable=await refreshNbaObservations([row],now,async()=>{throw Error('offline')});assert.deepEqual(unavailable.unavailablePlayers,['5144091']);
 for(const change of [p=>p.header.id='wrong',p=>p.boxscore.players[0].statistics[0].athletes[0].stats[1]='99']){
  const p=box();change(p);const result=await refreshNbaObservations([row],now,async url=>url.includes('/gamelog')?log:p);
  assert.equal(result.observations.length,0);assert.deepEqual(result.unavailablePlayers,['5144091']);
 }
});
test('locked and started cards never refresh or replace historical inputs',async()=>{
 let calls=0;const r=await refreshNbaObservations([{...row,frozen:true},{...row,gameState:'in'},{...row,gameTime:'2026-10-23'}],now,async()=>{calls++;return log});
 assert.equal(calls,0);assert.equal(r.observations.length,0);
});
test('college refresh uses current college season and complete official census, with no NBA endpoint or prior-season substitution',async()=>{
 const {refreshCbbObservations}=await loadTs(new URL('../lib/live-basketball-observations.ts',import.meta.url));
 const urls=[];const p=await refreshCbbObservations([row],now,async url=>{urls.push(url);const value=box();for(const team of value.boxscore.players)for(const a of team.statistics[0].athletes)a.stats[0]='40';return url.includes('/gamelog')?log:value});
 assert.equal(p.observations.length,60);assert.ok(p.observations.every(r=>r.sport==='cbb'&&r.season==='2027'&&r.workload===40));
 assert.ok(urls.every(url=>url.includes('/mens-college-basketball/')));assert.ok(urls[0].endsWith('season=2027'));assert.deepEqual(p.unavailablePlayers,[]);
 const empty=await refreshCbbObservations([row],now,async url=>url.includes('/gamelog')?{events:{},seasonTypes:[]}:box());assert.equal(empty.observations.length,0);assert.deepEqual(empty.unavailablePlayers,[]);
});
test('college history errors abstain; a mismatched fixture season cannot supply usable observations',async()=>{
 const {refreshCbbObservations}=await loadTs(new URL('../lib/live-basketball-observations.ts',import.meta.url));
 const p=await refreshCbbObservations([row],now,async url=>{if(url.includes('/gamelog'))return log;const value=box();value.header.season.year=2026;return value});
 assert.equal(p.observations.length,0);assert.deepEqual(p.unavailablePlayers,['5144091']);
});
