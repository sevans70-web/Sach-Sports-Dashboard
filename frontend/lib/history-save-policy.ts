export const PREGAME_WINDOW_MS=5*60_000;
export const FINAL_RETRY_MS=5*60_000;
/** Never label evidence captured at or after kickoff as pregame. */
export function pregameCheckpointRows(board:any,now=Date.now()){
 const boardAt=board?.capturedAt||board?.boardCapturedAt||board?.featuredCapturedAt||board?.updatedAt;
 return (board?.rows||[]).filter((row:any)=>{
  const start=Date.parse(row.gameTime||''),captured=Date.parse(row.boardCapturedAt||boardAt||'');
  return row.gameId&&Number.isFinite(start)&&start>now&&start-now<=PREGAME_WINDOW_MS&&Number.isFinite(captured)&&captured<start&&captured<=now;
 });
}
export function gameSaveAction(game:any,lastAttempt=0,now=Date.now()){
 const start=Date.parse(game.gameTime||'');
 if(!Number.isFinite(start))return null;
 if(start>now&&start-now<=PREGAME_WINDOW_MS&&now-lastAttempt>=60_000)return 'pregame';
 // Poll delayed/overnight finals for seven days; never infer a final from elapsed time.
 if(now>=start+60*60_000&&now-start<7*86400_000&&now-lastAttempt>=FINAL_RETRY_MS)return 'final';
 return null;
}
export function isOfficialFinal(payload:any,gameId:string){
 return payload?.success===true&&String(payload.gameId)===String(gameId)&&['post','final','off'].includes(String(payload.state||'').toLowerCase())&&Array.isArray(payload.rows)&&payload.rows.length>0;
}

/** Raw adapters preserve full official evidence without inventing a player result. */
export function rawOfficialFinal(sport:string,gameId:string,payload:any){
 if(sport==='mlb')return String(payload?.gamePk)===gameId&&payload?.gameData?.status?.abstractGameState==='Final'&&Object.keys(payload?.liveData?.boxscore?.teams?.home?.players||{}).length>0&&Object.keys(payload?.liveData?.boxscore?.teams?.away?.players||{}).length>0;
 if(sport==='soccer'){
  const game=payload?.header?.competitions?.[0],status=game?.status?.type||payload?.header?.status?.type;
  return String(payload?.header?.id||game?.id)===gameId&&(status?.completed===true||status?.state==='post')&&Array.isArray(payload?.rosters)&&payload.rosters.length>=2;
 }
 return false;
}
