import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {captureVersionOneChecksum,immutableModelHistoryRow,appendMissingImmutableModelPicks} from '../scripts/worker-pregame-history.mjs';

const gameTime='2026-11-09T22:00:00.000Z',capturedAt='2026-11-09T19:00:00.000Z';
function payload(){
 return {
  version:1,sport:'nba',market:'points',gameId:'12345',playerId:'67890',playerName:'Example Player',teamName:'Example Team',matchup:'Example @ Example',
  gameTime,capturedAt,sourcePrediction:'OVER',fittedModelPick:'UNDER',
  modelSelection:{side:'UNDER',line:22.5,price:-110,quoteId:'Q1',sportsbookKey:'book-one',calculatedAt:'2026-11-09T18:59:30.000Z'},
  modelProjection:21.9,historicalBaseline:23.1,
  quote:{quoteId:'Q1',sportsbook:'Book One',sportsbookKey:'book-one',line:22.5,overPrice:-110,underPrice:-110,lineType:'main',quoteUpdatedAt:'2026-11-09T18:59:00.000Z',quotePeriod:'game',quoteMarket:'points'},
  modelValidation:false,dataType:'original_pregame_quote_not_graded'
 };
}
const jsonbSort=value=>Array.isArray(value)?value.map(jsonbSort):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,jsonbSort(v)])):value;
function record(){
 const original=payload();
 return {sport:'nba',market:'points',game_id:'12345',player_id:'67890',game_date:'2026-11-09',game_time:gameTime,captured_at:capturedAt,
  prediction_side:'UNDER',sportsbook_line:22.5,payload:jsonbSort(original),
  checksum:createHash('sha256').update(JSON.stringify(original)).digest('hex')};
}
test('v1 checksum survives Postgres JSONB object key reordering',()=>{
 const row=record();
 assert.notEqual(createHash('sha256').update(JSON.stringify(row.payload)).digest('hex'),row.checksum);
 assert.equal(captureVersionOneChecksum(row.payload),row.checksum);
 const selected=immutableModelHistoryRow(row);
 assert.equal(selected.pickSide,'UNDER');
 assert.equal(selected.sportsbookLine,22.5);
 assert.equal(selected.modelValidatedForBetting,false);
 assert.equal(selected.status,'pending');
 assert.equal(selected.performanceSource,'immutable_cloudflare_model_receipt');
});
test('separate official final grade never changes stored original line',()=>{
 const row=record();
 const grade={sport:'nba',market:'points',game_id:'12345',player_id:'67890',
  source_pick_checksum:row.checksum,prediction_side:'UNDER',original_line:22.5,result_status:'hit',actual:19,
  result_source:'official_final_boxscore',graded_at:'2026-11-10T05:00:00Z'};
 const settled=immutableModelHistoryRow(row,grade);
 assert.equal(settled.status,'hit');assert.equal(settled.actual,19);
 assert.equal(settled.sportsbookLine,22.5);
 assert.equal(row.payload.quote.line,22.5);
 const wrong=immutableModelHistoryRow(row,{...grade,source_pick_checksum:'a'.repeat(64)});
 assert.equal(wrong.status,'pending');
});
test('missing-only merge preserves existing saved line and historical grade',()=>{
 const newer=immutableModelHistoryRow(record());
 const original={...newer,sportsbookLine:21.5,pickSide:'OVER',status:'hit',actual:24,gradedAt:'2026-11-10T05:00:00Z'};
 const existing=[original,{...original,playerId:'2',gameTime:null}];
 const merged=appendMissingImmutableModelPicks(existing,[newer,{...newer,playerId:'5'}]);
 assert.equal(merged.added,1);assert.equal(merged.alreadyPresent,1);
 assert.strictEqual(merged.records[0],original);
 assert.equal(merged.records[0].sportsbookLine,21.5);
 assert.equal(merged.records[0].status,'hit');
});
test('tampered quote, model receipt and late captured record are excluded',()=>{
 const original=record();
 assert.equal(immutableModelHistoryRow({...original,payload:{...original.payload,quote:{...original.payload.quote,line:99.5}}}),null);
 assert.equal(immutableModelHistoryRow({...original,payload:{...original.payload,modelSelection:{...original.payload.modelSelection,quoteId:'not-the-original'}}}),null);
 assert.equal(immutableModelHistoryRow({...original,captured_at:'2026-11-10T01:00:00Z'}),null);
});
