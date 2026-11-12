import {cloudRequest} from './history-cloud.mjs';
import {createHash} from 'node:crypto';

const SPORTS=new Set(['nba','nfl','nhl','cfb','cbb']);
const dayOf=date=>{const parsed=new Date(date);if(!Number.isFinite(parsed.getTime()))return '';const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(parsed);const p=n=>parts.find(x=>x.type===n)?.value;return [p('year'),p('month'),p('day')].join('-');};
/** The legacy capture hash uses insertion-ordered JSON, while Postgres
 * jsonb reorders object keys. Reconstitute the exact v1 capture field order
 * before checking it; never mark a valid original as corrupted due to jsonb.
 */
export function captureVersionOneChecksum(value){
 if(!value||value.version!==1||typeof value.quote!=='object')return null;
 const pick=(source,fields)=>Object.fromEntries(fields.filter(k=>Object.hasOwn(source||{},k)).map(k=>[k,source[k]]));
 const quote=pick(value.quote,['quoteId','sportsbook','sportsbookKey','line','overPrice','underPrice','lineType','quoteUpdatedAt','quotePeriod','quoteMarket']);
 const model=value.modelSelection==null?null:pick(value.modelSelection,['side','line','price','quoteId','sportsbookKey','calculatedAt']);
 const ordered=pick(value,['version','sport','market','gameId','playerId','playerName','teamName','matchup','gameTime','capturedAt','sourcePrediction','fittedModelPick','modelSelection','priceComparison','modelProjection','historicalBaseline','quote','modelValidation','dataType']);
 ordered.modelSelection=model;ordered.quote=quote;
 if(ordered.priceComparison)ordered.priceComparison=pick(ordered.priceComparison,['overProbability','underProbability','pushProbability']);
 return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}
const id=(row)=>[row?.market,row?.game_id,row?.player_id].join('|');
const keyOf=(r)=>[r?.market,r?.gameId,r?.playerId].join('|');
/** Select only verified original model selections. Original quote-only snapshots
 * are not predictions and should never appear in a performance hit-rate.
 */
export function immutableModelHistoryRow(pick,grade){
 const receipt=pick?.payload?.modelSelection,quote=pick?.payload?.quote;
 const at=Date.parse(pick?.captured_at||''),start=Date.parse(pick?.game_time||''),modelAt=Date.parse(receipt?.calculatedAt||'');
 if(!SPORTS.has(pick?.sport)||!/^\d+$/.test(String(pick?.game_id||''))||!/^\d+$/.test(String(pick?.player_id||''))||
 !/^[0-9a-f]{64}$/.test(String(pick?.checksum||''))||!['OVER','UNDER'].includes(pick?.prediction_side)||
 !Number.isFinite(start)||!Number.isFinite(at)||!Number.isFinite(modelAt)||modelAt>at||at>=start||
 !Number.isFinite(pick?.sportsbook_line)||receipt?.line!==pick.sportsbook_line||receipt?.side!==pick.prediction_side||
 receipt?.quoteId!==quote?.quoteId||receipt?.sportsbookKey!==quote?.sportsbookKey||
 receipt?.price!==(receipt.side==='OVER'?quote?.overPrice:quote?.underPrice)||
 dayOf(pick.game_time)!==pick.game_date||typeof pick?.payload!=='object')return null;
 // Database checksums are over the original payload and are never rewritten.
 if(captureVersionOneChecksum(pick.payload)!==pick.checksum)return null;
 const validGrade=grade&&id(grade)===id(pick)&&grade.source_pick_checksum===pick.checksum&&
 ['hit','miss','push'].includes(grade.result_status)&&Number.isFinite(grade.actual)&&
 grade.prediction_side===pick.prediction_side&&grade.original_line===pick.sportsbook_line&&
 grade.result_source==='official_final_boxscore';
 return {
  sport:pick.sport,market:pick.market,gameId:pick.game_id,playerId:pick.player_id,
  playerName:pick.payload.playerName,teamName:pick.payload.teamName,matchup:pick.payload.matchup,
  gameTime:pick.game_time,gameDate:pick.game_date,savedAt:pick.captured_at,boardCapturedAt:pick.captured_at,
  key:[pick.game_date,pick.market,pick.game_id,pick.player_id].join('|'),
  pickSide:pick.prediction_side,prediction:pick.prediction_side,sportsbookLine:pick.sportsbook_line,
  modelProjection:typeof pick.payload.modelProjection==='number'?pick.payload.modelProjection:null,
  researchForecast:typeof pick.payload.modelProjection==='number'?{status:'available',projection:pick.payload.modelProjection}:undefined,
  quoteVerified:true,marketBacked:true,
  status:validGrade?grade.result_status:'pending',actual:validGrade?grade.actual:null,
  gradedAt:validGrade?grade.graded_at:null,
  resultSource:validGrade?'official_final_boxscore':null,verifiedResult:Boolean(validGrade),
  originalSelectionChecksum:pick.checksum,modelValidatedForBetting:pick.payload.modelValidation===true,
  performanceSource:'immutable_cloudflare_model_receipt',historyBasis:'original_saved_research_forecast',
 };
}
/** Merge only missing identities; NEVER replace an original selected by existing
 * history reconciliation, even when that older copy has different lines.
 */
export function appendMissingImmutableModelPicks(existing,protectedRows){
 const seen=new Set(existing.filter(r=>r?.gameId&&r?.playerId).map(r=>[dayOf(r.gameTime),keyOf(r)].join('|')));
 const output=[...existing];let added=0,alreadyPresent=0;
 for(const row of protectedRows){
  const key=[dayOf(row.gameTime),keyOf(row)].join('|');
  if(seen.has(key)){alreadyPresent++;continue;}
  seen.add(key);output.push(row);added++;
 }
 return {records:output,added,alreadyPresent};
}
async function boundedRead(table,sport,firstDay,limit){
 const result=[];
 for(let offset=0;offset<limit;offset+=200){
  const query=new URLSearchParams({select:'*',sport:'eq.'+sport,game_date:'gte.'+firstDay,
   order:'game_date.desc,market.asc,game_id.asc,player_id.asc',limit:'200',offset:String(offset)});
  const rows=await cloudRequest(table+'?'+query.toString(),{signal:AbortSignal.timeout(12000)});
  if(!Array.isArray(rows))throw Error('Invalid protected original history');
  result.push(...rows);
  if(rows.length<200)return result;
 }
 throw Error('Protected original history requires paginated recovery');
}
/** Bounded seven-day receipts, separate from the legacy document reader.
 * A failed supplemental read must be surfaced, not reported as complete.
 */
export async function readImmutableModelHistory(sport,firstDay){
 if(!SPORTS.has(sport)||!/^\d{4}-\d{2}-\d{2}$/.test(firstDay))throw Error('Invalid protected history scope');
 const picks=await boundedRead('worker_pregame_picks',sport,firstDay,1000);
 if(!picks.length)return {rows:[],invalid:0};
 const grades=await boundedRead('worker_pregame_grades',sport,firstDay,1000);
 const map=new Map(grades.map(r=>[id(r),r])),rows=[];let invalid=0;
 for(const pick of picks){
  const row=immutableModelHistoryRow(pick,map.get(id(pick)));
  if(row)rows.push(row);else invalid++;
 }
 return {rows,invalid};
}
