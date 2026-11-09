/** Grade saved, immutable pregame model picks from independently verified
 * official FINAL player statistics. Never use a later live line or projection.
 * Grades live in a separate insert-only table, not in the original receipts.
 */
const SPORTS=['nba','nhl','nfl','cfb','cbb'];
const ROUTES={
 nba:'/api/basketball/live-player-stats?sport=nba&gameId=',
 cbb:'/api/basketball/live-player-stats?sport=cbb&gameId=',
 nfl:'/api/football/live-player-stats?sport=nfl&gameId=',
 cfb:'/api/football/live-player-stats?sport=cfb&gameId=',
 nhl:'/api/nhl/live-player-stats?gameId='
};
function credentials(env){
 const key=String(env?.SUPABASE_SECRET_KEY||'');
 const base=String(env?.SUPABASE_URL||'').replace(/\/$/,'');
 if(!key||!/^https:\/\//.test(base))throw Error('Protected grading database unavailable');
 return {base,headers:{apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key}),Accept:'application/json','Content-Type':'application/json'}};
}
async function readDb(env,path,fetchImpl){
 const {base,headers}=credentials(env);
 const response=await fetchImpl(base+'/rest/v1/'+path,{headers,cache:'no-store',signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw Error('Official grading read HTTP '+response.status);
 return response.json();
}
async function writeDb(env,path,items,fetchImpl){
 const {base,headers}=credentials(env);
 const response=await fetchImpl(base+'/rest/v1/'+path,{method:'POST',headers:{...headers,Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify(items),cache:'no-store',signal:AbortSignal.timeout(18000)});
 if(!response.ok)throw Error('Official grading save HTTP '+response.status);
}
export function gradeCapturedModelPick(saved,official,now=Date.now()){
 if(!saved||!official||official.success!==true||!['post','final','off'].includes(String(official.state||'').toLowerCase()))return null;
 if(String(saved.game_id)!==String(official.gameId)||!/^\d+$/.test(String(saved.player_id||''))||!/^\d+$/.test(String(saved.game_id||'')))return null;
 const side=String(saved.prediction_side||'');
 const line=saved.sportsbook_line;
 const gameTime=Date.parse(saved.game_time||''),capturedAt=Date.parse(saved.captured_at||'');
 if(!['OVER','UNDER'].includes(side)||typeof line!=='number'||!Number.isFinite(line)||
   !Number.isFinite(gameTime)||!Number.isFinite(capturedAt)||capturedAt>=gameTime||now<=gameTime)return null;
 const receipt=saved.payload?.modelSelection,quote=saved.payload?.quote;
 if(!receipt||receipt.side!==side||receipt.line!==line||receipt.quoteId!==quote?.quoteId||
  receipt.sportsbookKey!==quote?.sportsbookKey||receipt.price!==(side==='OVER'?quote.overPrice:quote.underPrice))return null;
 const at=Date.parse(receipt.calculatedAt||'');
 if(!Number.isFinite(at)||at>=gameTime||at>capturedAt)return null;
 const observed=official.rows?.find(row=>String(row.playerId)===String(saved.player_id));
 const actual=observed?.stats?.[saved.market];
 if(typeof actual!=='number'||!Number.isFinite(actual))return null;
 const status=actual===line?'push':(side==='OVER'?actual>line:actual<line)?'hit':'miss';
 return {sport:saved.sport,market:saved.market,game_id:String(saved.game_id),player_id:String(saved.player_id),game_date:saved.game_date,
  source_pick_checksum:saved.checksum,prediction_side:side,original_line:line,actual,result_status:status};
}
export function gradingSportForTick(scheduledTime){
 const date=new Date(scheduledTime);
 if(!Number.isFinite(date.getTime())||date.getUTCMinutes()%30!==0)return null;
 return SPORTS[Math.floor(scheduledTime/(30*60_000))%SPORTS.length];
}
export async function gradeSavedWorkerPicks(env,dashboard,ctx,scheduledTime=Date.now(),fetchImpl=globalThis.fetch){
 const sport=gradingSportForTick(scheduledTime);
 if(!sport)return {skipped:true};
 const previous=new Date(scheduledTime-7*86400_000).toISOString();
 const cutoff=new Date(scheduledTime-60*60_000).toISOString();
 const params=new URLSearchParams({select:'sport,market,game_id,player_id,game_date,game_time,captured_at,prediction_side,sportsbook_line,checksum,payload',
  sport:'eq.'+sport,game_time:'gte.'+previous,order:'game_time.asc',limit:'250'});
 const [picks,grades]=await Promise.all([
  readDb(env,'worker_pregame_picks?'+params.toString(),fetchImpl),
  readDb(env,'worker_pregame_grades?'+new URLSearchParams({select:'game_id,player_id,market',sport:'eq.'+sport,game_date:'gte.'+previous.slice(0,10),limit:'1000'}),fetchImpl)
 ]);
 if(!Array.isArray(picks)||!Array.isArray(grades))throw Error('Invalid protected original records');
 const existing=new Set(grades.map(r=>[r.market,r.game_id,r.player_id].join('|')));
 const pending=picks.filter(r=>Date.parse(r.game_time)<Date.parse(cutoff)&&!existing.has([r.market,r.game_id,r.player_id].join('|')));
 const games=[...new Set(pending.map(r=>r.game_id))].slice(0,2);
 const results=[];
 let finalGames=0;
 for(const gameId of games){
  const response=await dashboard.fetch(new Request('https://sach-grading.internal'+ROUTES[sport]+encodeURIComponent(gameId)),env,ctx);
  if(!response.ok)continue;
  const official=await response.json();
  if(official?.success!==true||String(official?.gameId)!==String(gameId)||!['post','final','off'].includes(String(official?.state||'').toLowerCase()))continue;
  finalGames++;
  for(const saved of pending.filter(r=>String(r.game_id)===String(gameId))){
   const grade=gradeCapturedModelPick(saved,official,scheduledTime);
   if(grade)results.push(grade);
  }
 }
 if(results.length){
  await writeDb(env,'worker_pregame_grades?on_conflict=sport,market,game_id,player_id',results,fetchImpl);
  const check=await readDb(env,'worker_pregame_grades?'+new URLSearchParams({select:'sport,market,game_id,player_id,source_pick_checksum,result_status,actual',sport:'eq.'+sport,game_id:'in.('+games.join(',')+')',limit:'250'}),fetchImpl);
  const verified=new Map(check.map(row=>[[row.market,row.game_id,row.player_id].join('|'),row]));
  for(const grade of results){
   const saved=verified.get([grade.market,grade.game_id,grade.player_id].join('|'));
   if(!saved||saved.source_pick_checksum!==grade.source_pick_checksum||saved.result_status!==grade.result_status||Number(saved.actual)!==grade.actual)throw Error('Original pick grade verification mismatch');
  }
 }
 return {sport,picks:picks.length,alreadyGraded:grades.length,pending:pending.length,gamesChecked:games.length,officialFinals:finalGames,gradesVerified:results.length};
}
