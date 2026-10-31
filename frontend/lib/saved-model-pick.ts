import {verifiedPropQuote} from '@/lib/prop-integrity';
/** A selection must already exist in the saved pregame row. Never infer one from a result. */
export function savedModelPick(row:any,capturedAt=row?.boardCapturedAt){
 const forecast=row?.researchForecast,pick=forecast?.modelSelection;
 if(!forecast)return null;
 if((forecast?.status!=null&&forecast.status!=='available')||forecast.giReason==='price_validation_failed'||forecast.selectionReason==='price_validation_failed')return null;
 if(forecast.calculatedAt!=null&&Date.parse(forecast.calculatedAt)!==Date.parse(pick?.calculatedAt||''))return null;
 const binding=forecast.priceComparison?.quoteEvidence;
 if(binding&&((row.sport&&binding.sport!==row.sport)||binding.market!==row.market||String(binding.gameId)!==String(row.gameId)||String(binding.playerId)!==String(row.playerId)||binding.quoteId!==row.quoteId||binding.sportsbookKey!==row.sportsbookKey||binding.line!==row.sportsbookLine||binding.overPrice!==row.overPrice||binding.underPrice!==row.underPrice||Date.parse(binding.calculatedAt)!==Date.parse(pick?.calculatedAt||'')))return null;
 const capture=Date.parse(capturedAt||''),decision=Date.parse(pick?.calculatedAt||''),start=Date.parse(row?.gameTime||'');
 if(!pick||!['OVER','UNDER'].includes(pick.side)||!Number.isFinite(capture)||!Number.isFinite(decision)||!Number.isFinite(start)||capture>=start||decision>capture||decision>=start||decision<Date.parse(row?.quoteUpdatedAt||''))return null;
 if(!verifiedPropQuote(row,capture,true)||!pick.quoteId||pick.quoteId!==row.quoteId||pick.sportsbookKey!==row.sportsbookKey||pick.line!==row.sportsbookLine||pick.price!==(pick.side==='OVER'?row.overPrice:row.underPrice))return null;
 return pick;
}

/** Show the exact saved selection; a pregame card must still have a fresh quote. */
export function cardModelPick(row:any,now=Date.now()){
 const pick=savedModelPick(row,String(row?.market||'').startsWith('q1_')&&row?.forecastCapturedAt?row.forecastCapturedAt:row?.boardCapturedAt||row?.researchForecast?.modelSelection?.calculatedAt);
 if(!pick)return null;
 if(row.boardFrozen===true)return pick;
 if(row.frozen||row.lockedAtKickoff||['in','post'].includes(row.gameState)||Date.parse(row.gameTime)<=now||!verifiedPropQuote(row,now))return null;
 return pick;
}

/** The projection slot never substitutes an observed average or legacy baseline. */
export function cardModelProjection(row:any,now=Date.now()):number|null{
 const forecast=row?.researchForecast;
 if(forecast?.status!=='available'||typeof forecast.projection!=='number'||!Number.isFinite(forecast.projection))return null;
 if(row.boardFrozen!==true&&(row.frozen||row.lockedAtKickoff||['in','post'].includes(row.gameState)||Date.parse(row.gameTime)<=now))return null;
 return forecast.projection;
}

/** Before the daily lock, put supported picks in the dashboard preview first.
 * Keep the existing order within each group; no GI or new selection is inferred. */
export function prioritizeModelPicks(rows:any[],now=Date.now()){
 if(rows.some(row=>row.boardFrozen||row.frozen||row.lockedAtKickoff))return rows;
 return rows.map((row,index)=>({row,index,selected:cardModelPick(row,now)!=null}))
  .sort((a,b)=>Number(b.selected)-Number(a.selected)||a.index-b.index)
  .map(({row},index)=>({...row,rank:index+1}));
}

export function modelPickNotice(row:any){
 const reason=row?.researchForecast?.reason||row?.researchForecast?.selectionReason;
 if(reason==='price_threshold_not_met')return 'No qualifying price';
 if(reason==='verified_quote_unavailable')return 'Verified line and price needed';
 if(['prior_basketball_role_uncertain','basketball_role_uncertain'].includes(reason))return 'Role is uncertain';
 if(['player_team_history_unavailable','insufficient_basketball_role_history'].includes(reason))return 'More same-team history needed';
 if(reason==='reported_unavailable')return 'Reported unavailable';
 if(reason==='price_validation_failed')return 'Accuracy checks not met';
 if(reason==='price_validation_missing')return 'Pick verification is incomplete';
 if(reason==='market_model_not_fitted')return ['anytime_td','first_td','q1_anytime_td'].includes(row?.market)?'Scorer forecast not available yet':'Forecast not available yet';
 return 'Not enough evidence for a pick';
}

/** Presentation-only direction cap for new rankings. Never rewrite saved picks.
 * Inputs are already ordered by their supported ranking score; the first five
 * UNDER selections are therefore the strongest eligible UNDERs in that board.
 * Extra OVER rows must come from actual upstream candidates, never relabelling. */
export function capRankingUnders<T>(rows:T[],side:(row:T)=>string|null|undefined,maximum=5):T[]{
 let under=0;
 return rows.filter(row=>{
  if(String(side(row)||'').toUpperCase()!=='UNDER')return true;
  if(under>=maximum)return false;
  under++;
  return true;
 });
}
