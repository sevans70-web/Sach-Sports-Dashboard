const unavailable=(message:string)=>Object.assign(new Error(message),{retryable:false});
/** View-only checks. Never relabel an upstream row or edit its saved evidence. */
export function checkedRankingPayload(payload:any,sport:string,market:string,now=Date.now()){
 if(!payload||payload.success===false||!Array.isArray(payload.rows))throw Error(payload?.error||'Ranking data is unavailable');
 if(payload.market&&payload.market!==market)throw unavailable('Ranking response belongs to another market; current rankings were retained');
 if(payload.boardUnavailable===true)throw unavailable('The original pregame ranking board is unavailable. No current predictions can be verified from this response');
 const reasons:Record<string,number>={},reject=(reason:string)=>{reasons[reason]=(reasons[reason]||0)+1;return false;};
 const rows=payload.rows.filter((row:any)=>{
  if(row.sport&&row.sport!==sport||row.market&&row.market!==market)return reject('market_or_sport_mismatch');
  if(!row.playerId||!row.gameId||!Number.isFinite(Date.parse(row.gameTime||'')))return reject('player_or_game_identity_missing');
  const context=row.pregameContext;
  if(context&&(context.playerId!=null&&String(context.playerId)!==String(row.playerId)||context.gameId!=null&&String(context.gameId)!==String(row.gameId)))return reject('pregame_identity_mismatch');
  if(row.quoteMarket&&row.quoteMarket!==market||row.quotePeriod&&row.quotePeriod!==(market.startsWith('q1_')?'q1':'game'))return reject('quote_market_or_period_mismatch');
  const f=row.researchForecast;
  if(f?.status==='available'){
   if(f.modelGroup&&f.modelGroup!==sport+'|'+market)return reject('forecast_market_mismatch');
   if(f.calculatedAt&&(!Number.isFinite(Date.parse(f.calculatedAt))||Date.parse(f.calculatedAt)>now||Date.parse(f.calculatedAt)>=Date.parse(row.gameTime)))return reject('forecast_time_invalid');
   const b=f.priceComparison?.quoteEvidence;
   if(b&&(b.sport!==sport||b.market!==market||String(b.playerId)!==String(row.playerId)||String(b.gameId)!==String(row.gameId)||b.quoteId!==row.quoteId||b.sportsbookKey!==row.sportsbookKey||b.line!==row.sportsbookLine||b.overPrice!==row.overPrice||b.underPrice!==row.underPrice))return reject('forecast_quote_identity_mismatch');
  }
  return true;
 });
 const withheld=payload.rows.length-rows.length;
 return {...payload,rows,rankingEvidenceDiagnostics:{sourceRows:payload.rows.length,acceptedRows:rows.length,withheld,reasons},coverageNotice:[payload.coverageNotice,withheld?`${withheld} ranking ${withheld===1?'row was':'rows were'} withheld because player, game, market or forecast evidence did not match.`:''].filter(Boolean).join(' ')};
}
/** Qualification is separate: an available return never loses its sign here. */
export function rankingEvText(percent:unknown,sport:string,format:(v:number)=>string){
 return typeof percent==='number'&&Number.isFinite(percent)&&(['nba','nfl','nhl'].includes(sport)||percent>0)?format(percent):'—';
}
