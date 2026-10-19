import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {footballModelObservations}=await loadTs(new URL('../lib/football-model-observations.ts',import.meta.url));
const identity={sport:'nfl',season:'2025',gameId:'g',source:'official',retrievedAt:'2025-10-10T00:00:00Z'};
function payload(){return {header:{id:'g',season:{year:2025,type:2},competitions:[{date:'2025-10-01T00:00:00Z',status:{type:{completed:true}},competitors:[{team:{id:'a',abbreviation:'A'}},{team:{id:'b',abbreviation:'B'}}]}]},boxscore:{players:[{team:{id:'a',abbreviation:'A'},statistics:[{name:'passing',labels:['C/ATT','YDS'],athletes:[{athlete:{id:'backup',displayName:'Backup'},stats:['0/2','0']},{athlete:{id:'starter',displayName:'Starter'},stats:['20/30','250']}]},{name:'receiving',labels:['REC','YDS','TGTS'],athletes:[{athlete:{id:'wr',displayName:'WR'},stats:['2','10','5']}]}]}]}}}
test('completed game population preserves historical membership, backup zeros and target workload',()=>{
 const rows=footballModelObservations(payload(),identity);
 const backup=rows.find(r=>r.playerId==='backup'&&r.market==='passing_yards');assert.equal(backup.actual,0);assert.equal(backup.workload,2);
 const receiver=rows.find(r=>r.playerId==='wr'&&r.market==='receiving_yards');assert.equal(receiver.workload,5);assert.equal(receiver.actual,10);
 assert.equal(receiver.teamId,'a');assert.equal(receiver.opponentId,'b');
});
test('wrong game, season, preseason, unfinished or not-yet-available results cannot enter training',()=>{
 assert.equal(footballModelObservations(payload(),{...identity,gameId:'wrong'}).length,0);
 assert.equal(footballModelObservations(payload(),{...identity,season:'2026'}).length,0);
 const preseason=payload();preseason.header.season.type=1;assert.equal(footballModelObservations(preseason,identity).length,0);
 const live=payload();live.header.competitions[0].status.type.completed=false;assert.equal(footballModelObservations(live,identity).length,0);
 assert.equal(footballModelObservations(payload(),{...identity,retrievedAt:'2025-10-02T00:00:00Z'}).length,0);
});
test('missing target count stays unknown rather than substituting catches or zero',()=>{
 const p=payload();p.boxscore.players[0].statistics[1].athletes[0].stats[2]='';
 assert.equal(footballModelObservations(p,identity).filter(r=>r.playerId==='wr').length,0);
});
