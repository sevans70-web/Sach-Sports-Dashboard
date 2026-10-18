import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {espnParticipation,nhlParticipation,playerAvailability,applyParticipationEvidence}=await loadTs(new URL('../lib/player-participation.ts',import.meta.url));
const summary=(labels,athletes)=>({boxscore:{players:[{statistics:[{labels,athletes}]}]}});
const athlete=(id,stats,extra={})=>({athlete:{id},stats,...extra});
test('NFL and CFB zero-yard relief attempts confirm participation; unused backups and game clocks do not',()=>{
 for(const sport of ['nfl','cfb']){
  const rows=espnParticipation(summary(['C/ATT','YDS'],[athlete('1',['0/2','0']),athlete('2',['0/0','0']),athlete('3',['2/2','20'],{didNotPlay:true})]),sport);
  assert.equal(rows.find(r=>r.playerId==='1').participationConfirmed,true);assert.equal(rows[0].starterConfirmed,false);assert.equal(rows.find(r=>r.playerId==='2').participationConfirmed,false);assert.equal(rows.length,2);
 }
 assert.equal(playerAvailability({gameState:'in',liveCurrent:0}).label,'Participation unconfirmed');
});
test('receiving targets confirm participation without requiring catches or yards',()=>{
 assert.equal(espnParticipation(summary(['REC','YDS','TGTS'],[athlete('1',['0','0','2'])]),'nfl')[0].participationConfirmed,true);
});
test('NBA, WNBA and CBB use observed minutes, distinguishing starter confirmation from an appearance',()=>{
 for(const sport of ['nba','wnba','cbb']){
  const rows=espnParticipation(summary(['MIN','PTS'],[athlete('1',['0:01','0']),athlete('2',['0','0']),athlete('3',['0','0'],{starter:true}),athlete('4',['DNP','0'],{didNotPlay:true})]),sport);
  assert.equal(rows[0].participationConfirmed,true);assert.equal(rows[1].participationConfirmed,false);assert.equal(rows[2].starterConfirmed,true);assert.equal(rows[2].participationConfirmed,false);assert.equal(rows.length,3);
 }
});
test('NHL confirms zero-stat skaters and relief goalies by ice time, excluding unused goalies',()=>{
 const rows=nhlParticipation({playerByGameStats:{awayTeam:{forwards:[{playerId:'1',toi:'00:01',sog:0}],goalies:[{playerId:'2',toi:'00:00'},{playerId:'3',toi:'02:00'}]}}});
 assert.equal(rows[0].participationConfirmed,true);assert.equal(rows[1].participationConfirmed,false);assert.equal(rows[2].participationConfirmed,true);
});
test('cross-dashboard labels and expanded detail reflect participation without inventing starting status',()=>{
 for(const sport of ['nfl','cfb','nba','wnba','cbb','nhl']){
  const row={sport,gameId:'A',playerId:'1',gameState:'in'},payload={success:true,gameId:'A',state:'in',participants:[{playerId:'1',participationConfirmed:true,starterConfirmed:false}]};
  const updated=applyParticipationEvidence(row,payload,'A');assert.equal(playerAvailability(updated).label,'Playing');assert.equal(updated.starterConfirmed,false);assert.match(playerAvailability(updated).detail,/does not establish starting/);
  assert.equal(playerAvailability({...updated,gameState:'post'}).label,'Played');
  for(const other of [{...payload,gameId:'B'},{...payload,success:false},{...payload,participants:[{playerId:'2',participationConfirmed:true}]}])assert.deepEqual(applyParticipationEvidence(row,other,'A'),row);
  assert.equal(playerAvailability({...updated,gameId:'B'}).confirmed,false);
 }
 assert.equal(playerAvailability({gameState:'pre'}).label,'Lineup pending');assert.equal(playerAvailability({gameState:'pre',starterConfirmed:true}).label,'Confirmed');
});
test('ranking refresh preserves confirmed participation only for the exact player and fixture',async()=>{
 const {retainParticipation}=await loadTs(new URL('../lib/player-participation.ts',import.meta.url));
 const previous={playerId:'1',gameId:'A',participationGameId:'A',participationConfirmed:true};
 const row={playerId:'1',gameId:'A',gameState:'in'};
 assert.equal(playerAvailability(retainParticipation(row,previous)).label,'Playing');
 for(const other of [{...row,gameId:'B'},{...row,playerId:'2'}])assert.deepEqual(retainParticipation(other,previous),other);
});
