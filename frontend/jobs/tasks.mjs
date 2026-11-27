/** Phase handlers: immutable reservations precede every external write. */
import {originalPregameQuote,saveImmutablePregameRows} from '../scripts/worker-pregame-capture.mjs';
import {gradeCapturedModelPick,ROUTES,readDb,writeDb} from '../scripts/worker-pregame-grade.mjs';
import {readWorkerRecentReplayPage} from '../scripts/worker-history-backup.mjs';
import {JobDeferred} from './budget.mjs';
const key=r=>[r.market,r.game_id,r.player_id].join('|');
const chunkSize=30;
function requireCaptureBoard(board) {
 if (board?.boardUnavailable !== true) return;
 const error = new JobDeferred('rankings_board_unavailable');
 error.blocked = true;
 throw error;
}
export async function capturePhase(job,services){
 const {env,route,publish,now}=services;
 requireCaptureBoard(job.board);
 if(job.phase==='rank'){
  const response=await route('/api/'+job.sport+'/rankings?market='+encodeURIComponent(job.market));
  if(!response.ok){
   const failure=job.sport==='nba'?await response.json().catch(()=>null):null;
   const code=failure?.reason;
   throw new JobDeferred(typeof code==='string'&&/^nba_capture_board_(locked|unverified|storage_unverified)$/.test(code)
    ?code:'rankings_http_'+response.status);
  }
  const board=await response.json();
  requireCaptureBoard(board);
  if(board?.success===false||!Array.isArray(board?.rows))throw new JobDeferred('rankings_unavailable');
  const unique=new Map();
  for(const row of board.rows){const quote=originalPregameQuote(row,job.sport,job.market,now());if(quote&&!unique.has(key(quote)))unique.set(key(quote),quote);}
  const quotes=[...unique.values()];
  return {...job,phase:'originals',board,quotes,cursor:0,eligible:quotes.length,stored:0,picksStored:0,expired:0};
 }
 if(job.phase==='originals'||job.phase==='picks'){
  const input=job.phase==='picks'?job.quotes.filter(q=>['OVER','UNDER'].includes(q.prediction_side)):job.quotes;
  const batch=input.slice(job.cursor,job.cursor+chunkSize);let expired=0;
  const stored=await saveImmutablePregameRows(env,'worker_pregame_'+(job.phase==='picks'?'picks':'originals'),batch,globalThis.fetch,{requirePregame:true,onExpired:()=>expired++});
  const field=job.phase==='picks'?'picksStored':'stored';
  return {...job,[field]:job[field]+stored,expired:job.expired+expired,cursor:job.cursor+batch.length,
   ...(job.cursor+batch.length>=input.length?{phase:job.phase==='originals'?'picks':'publish',cursor:0}:{})};
 }
 if(job.phase==='publish'){
  // Do not refresh stale reserved boards into a current-market cache.
  if(job.board?.rows?.length&&now()-job.reservedAt<120000)await publish?.(env,job.sport,job.market,job.board);
  const {board,quotes,...receipt}=job;
  return {...receipt,phase:'done',state:'done'};
 }
 throw Error('invalid_capture_phase');
}
export async function gradePhase(job,{env,route,now,store}){
 if(job.phase==='scan'){
  // Fixed creation cutoff + immutable picks make pagination stable while new captures arrive.
  const params=new URLSearchParams({select:'sport,market,game_id,player_id,game_date,game_time,captured_at,prediction_side,sportsbook_line,checksum,payload',
   sport:'eq.'+job.sport,game_time:'gte.'+new Date(job.created-7*86400000).toISOString(),
   and:'(game_time.lt.'+new Date(job.created-3600000).toISOString()+',captured_at.lte.'+new Date(job.created).toISOString()+')',
   order:'game_time.asc,game_id.asc,market.asc,player_id.asc',limit:'50',offset:String(job.cursor||0)});
  const picks=await readDb(env,'worker_pregame_picks?'+params,fetch);
  if(!Array.isArray(picks))throw Error('invalid_grade_source');
  if(!picks.length)return {...job,state:'done',phase:'done'};
  return {...job,phase:'game',picks,games:[...new Set(picks.map(p=>String(p.game_id)))],gameCursor:0};
 }
 if(job.phase==='game'){
  const gameId=job.games[job.gameCursor];
  if(!gameId){const {picks,games,grades,...next}=job;return {...next,phase:job.picks.length<50?'done':'scan',state:job.picks.length<50?'done':'active',cursor:job.cursor+job.picks.length};}
  const response=await route(ROUTES[job.sport]+encodeURIComponent(gameId));
  const official=response.ok?await response.json():null;
  if(!official?.success){store.document(job.id,'grade_unavailable_'+gameId,{gameId,status:response.status,at:now()});return {...job,gameCursor:job.gameCursor+1,unavailable:(job.unavailable||0)+1};}
  const grades=job.picks.filter(r=>String(r.game_id)===gameId).map(r=>gradeCapturedModelPick(r,official,now())).filter(Boolean);
  // Pending games/missing participants remain ungraded, without blocking later games.
  return {...job,phase:'write',grades,gradeCursor:0,pending:(job.pending||0)+(grades.length===0?1:0)};
 }
 if(job.phase==='write'){
  const batch=job.grades.slice(job.gradeCursor,job.gradeCursor+chunkSize);
  if(batch.length){
   const params=new URLSearchParams({select:'market,game_id,player_id,source_pick_checksum,result_status,actual',sport:'eq.'+job.sport,game_id:'eq.'+batch[0].game_id,market:'in.('+[...new Set(batch.map(r=>r.market))].join(',')+')',player_id:'in.('+[...new Set(batch.map(r=>r.player_id))].join(',')+')',limit:'1000'});
   const before=await readDb(env,'worker_pregame_grades?'+params,fetch);
   if(!Array.isArray(before))throw Error('invalid_existing_grades');
   const seen=new Map(before.map(r=>[key(r),r]));
   const fresh=batch.filter(r=>!seen.has(key(r)));
   if(fresh.length)await writeDb(env,'worker_pregame_grades?on_conflict=sport,market,game_id,player_id',fresh,fetch);
   const after=await readDb(env,'worker_pregame_grades?'+params,fetch);
   if(!Array.isArray(after))throw Error('invalid_grade_readback');
   const verified=new Map(after.map(r=>[key(r),r]));
   for(const r of batch){const saved=verified.get(key(r));if(!saved||saved.source_pick_checksum!==r.source_pick_checksum)throw Error('grade_readback_missing_or_wrong_original');
    // Previously recorded results are immutable even if the official stat is later corrected.
    if(!seen.has(key(r))&&(saved.result_status!==r.result_status||Number(saved.actual)!==r.actual))throw Error('grade_readback_mismatch');}
  }
  const next=job.gradeCursor+batch.length;
  return {...job,gradeCursor:next,verified:(job.verified||0)+batch.length,...(next>=job.grades.length?{phase:'game',gameCursor:job.gameCursor+1}:{})};
 }
 throw Error('invalid_grading_phase');
}
export async function replayPhase(job,{env,route,store,createReplay,saveCorrections}){
 if(job.phase==='scan'){
  const page=await readWorkerRecentReplayPage(env,{sport:job.sport,day:job.day},job.cursor||'');
  for(const doc of page.rows)store.document(job.id,doc.stream,doc);
  return {...job,cursor:page.cursor,phase:page.done?'game':'scan',gameCursor:job.gameCursor||0};
 }
 if(job.phase==='game'){
  const replay=createReplay(job.sport);
  for(const doc of store.documents(job.id))if(doc.stream?.startsWith('protected_'))replay.consume(doc);
  const game=replay.gameIds()[job.gameCursor];
  if(!game)return {...job,state:'done',phase:'done'};
  const result=await replay.verify(route,finals=>saveCorrections(env.VINEXT_KV_CACHE,job.sport,job.day,finals),0,game);
  if(result.unavailable){store.document(job.id,'replay_unavailable_'+game,{gameId:game});return {...job,gameCursor:job.gameCursor+1,unavailable:(job.unavailable||0)+1};}
  return {...job,gameCursor:job.gameCursor+1,checked:(job.checked||0)+result.games,corrections:(job.corrections||0)+result.differences};
 }
 throw Error('invalid_replay_phase');
}
export async function runPhase(job,services){
 return job.kind==='capture'?capturePhase(job,services):job.kind==='grade'?gradePhase(job,services):job.kind==='replay'?replayPhase(job,services):Promise.reject(Error('invalid_job_kind'));
}
