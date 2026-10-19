import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const notes=await loadTs(new URL('../lib/record-notes.ts',import.meta.url));
const {applyParticipationEvidence,playerStatusNotice,retainParticipation}=await loadTs(new URL('../lib/player-participation.ts',import.meta.url));
const {researchFinalOutcome}=await loadTs(new URL('../lib/card-results.ts',import.meta.url));
const {adminResult}=await loadTs(new URL('../lib/admin-policy.ts',import.meta.url));
test('void reasons distinguish board withdrawal, late capture, missing line and unknown legacy causes',()=>{
 for(const sport of ['nfl','cfb','nba','wnba','cbb','nhl']){
  assert.equal(notes.voidRecordNote({sport,status:'void',withdrawnFromBoard:true}).code,'withdrawn');
  assert.equal(notes.voidRecordNote({sport,status:'void',recoveredAfterStart:true}).code,'late_capture');
  assert.equal(notes.voidRecordNote({sport,status:'void',sportsbookLine:null}).code,'missing_line');
  assert.equal(notes.voidRecordNote({sport,status:'void',sportsbookLine:12}).code,'reason_unrecorded');
  assert.equal(notes.voidRecordNote({sport,status:'hit'}),null);
 }
 assert.equal(notes.voidRecordNote({status:'void',voidReason:'Official player row unavailable',voidReasonCode:'no_stat_row'}).code,'no_stat_row');
});
test('explicit official DNP and injury statuses use exact fixture and player IDs, never a missing row',()=>{
 const payload={header:{id:'123'},injuries:[{injuries:[{athlete:{id:'42'},status:'Out',details:{type:'Knee'}}]}],boxscore:{players:[{statistics:[{labels:['MIN'],athletes:[{athlete:{id:'43'},didNotPlay:true,reason:'Coach decision'},{athlete:{id:'44'},stats:['0']},{athlete:{id:'45'},stats:['12:30'],starter:false}]}]}]}};
 for(const sport of ['nfl','cfb','nba','wnba','cbb']){
  const rows=notes.officialAvailabilityRows(payload,sport,'123');
  assert.match(rows.find(r=>r.playerId==='42').note.text,/Out.*Knee/);
  assert.match(rows.find(r=>r.playerId==='43').note.text,/Did not play: Coach decision/);
  assert.equal(rows.find(r=>r.playerId==='44'),undefined);
  assert.equal(rows.some(r=>r.playerId==='unknown'),false);
  assert.deepEqual(notes.officialAvailabilityRows(payload,sport,'456'),[]);
  if(['nba','wnba','cbb'].includes(sport))assert.equal(rows.find(r=>r.playerId==='45').note.code,'bench_appearance');
 }
 assert.deepEqual(notes.officialAvailabilityRows({id:'123',playerByGameStats:{homeTeam:{forwards:[]}}},'nhl','123'),[]);
 assert.equal(notes.officialAvailabilityRows({id:'123',playerByGameStats:{homeTeam:{forwards:[{playerId:'42',didNotPlay:true}]}}},'nhl','123')[0].note.code,'official_dnp');
});
test('injury-only evidence reaches cards even without stats or participation and never crosses fixtures',()=>{
 const row={playerId:'42',gameId:'123'},note={code:'official_injury_status',text:'Reported Out · Knee',source:'ESPN game report',gameId:'123'};
 const payload={success:true,gameId:'123',state:'pre',participants:[],availability:[{playerId:'42',note}]};
 const updated=applyParticipationEvidence(row,payload,'123');assert.equal(playerStatusNotice(updated,'pregame'),note.text);assert.equal(updated.participationConfirmed,false);
 assert.equal(notes.playerAvailabilityNote({...updated,gameId:'456'}),null);
 assert.deepEqual(applyParticipationEvidence({...row,playerId:'99'},payload,'123'),{...row,playerId:'99'});
 assert.equal(retainParticipation(row,updated).availabilityEvidence.text,note.text);
 assert.equal(applyParticipationEvidence(updated,{...payload,availability:[]},'123').availabilityEvidence,undefined);
});
test('void cards cannot acquire a checkmark from actuals; admin shows separate availability and void reasons',()=>{
 const row={status:'void',sportsbookLine:10,quoteVerified:true,frozen:true,gameTime:'2026-10-18T15:00Z',savedAt:'2026-10-18T12:00Z',archivedOriginal:{prediction:'OVER',sportsbookLine:10},withdrawnFromBoard:true,injuryStatus:'Out'};
 const result=researchFinalOutcome(row,20,10,'points');assert.equal(result.label,'VOID · NOT SCORED');
 const r=adminResult(row);assert.equal(r.voidNote.code,'withdrawn');assert.match(r.availabilityNote.text,/Out/);assert.doesNotMatch(r.voidNote.text,/because.*injur/i);
});
test('unlisted final IDs can explain missing evidence but never establish an injury or DNP',()=>{
 const row={status:'void',gameId:'123',playerId:'42',sportsbookLine:10};
 const payload={id:'123',gameState:'OFF',playerByGameStats:{homeTeam:{forwards:[{playerId:'99'}]}}};
 assert.equal(notes.officialRecordAvailability(row,payload,'nhl').code,'absent_final_stat_row');
 assert.match(notes.officialRecordAvailability(row,payload,'nhl').text,/not confirmed/);
 assert.equal(notes.officialRecordAvailability({...row,gameId:'456'},payload,'nhl'),null);
 assert.equal(notes.officialRecordAvailability({...row,withdrawnFromBoard:true},payload,'nhl'),null);
});
