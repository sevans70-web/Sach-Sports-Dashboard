import {estimatedEv,nbaComparisonEv,formatEvPercent} from '@/lib/estimated-ev';
import {verifiedPropQuote} from '@/lib/prop-integrity';

const MARKETS=new Set(['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts']);
export const nbaEvMarket=(market:string)=>MARKETS.has(market);
const missing=(code:string,reason:string)=>({version:1 as const,status:'unavailable' as const,percent:null,code,reason});
/** Display pricing, not pick qualification. Never change ranks, predictions,
 * frozen receipts or the featured-card requirement for positive value. */
export function nbaRankingEv(row:any,now=Date.now()){
 if(row?.sport!=='nba'||!nbaEvMarket(row.market))return missing('unsupported_market','EV is not supported for this market');
 const f=row.researchForecast,start=Date.parse(row.gameTime||''),saved=row.boardFrozen===true||row.frozen===true||row.lockedAtKickoff===true||Number.isFinite(start)&&start<=now;
 if(row.withdrawnFromBoard||row.resultStatus==='void')return missing('withdrawn','This prop is withdrawn or void');
 if(f?.giReason==='price_validation_failed'||f?.selectionReason==='price_validation_failed')return missing('validation_failed','Model probability accuracy checks not met');
 if(f?.status!=='available'){
  const reasons:Record<string,string>={recent_official_history_unavailable:'Recent official player history is unavailable',insufficient_basketball_role_history:'More verified recent player history is needed',player_team_history_unavailable:'Verified history for this player and team is missing',insufficient_opponent_team_history:'More verified opponent history is needed',missing_exact_pregame_context:'Exact pregame matchup information is missing',reported_unavailable:'Player is reported unavailable',market_model_not_fitted:'A fitted probability model is not available for this market',snapshot_not_available:'A model snapshot is not available for this decision'};
  return {...missing('model_unavailable',reasons[f?.reason]||'An independent model probability is unavailable'),modelReason:f?.reason||null};
 }
 if(typeof row.sportsbookLine!=='number'||!Number.isFinite(row.sportsbookLine)||row.sportsbookLine<0||!Number.isInteger(row.sportsbookLine*2)||![row.overPrice,row.underPrice].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)>=100))return missing('quote_unavailable','A verified numeric line and complete two-sided American odds are needed');
 if(!verifiedPropQuote(row,now,saved))return missing('quote_unavailable',saved?'Verified original pregame sportsbook odds needed':'Current, complete sportsbook odds needed (maximum age 15 minutes)');
 const p=f.priceComparison;
 if(!p)return missing('probability_unavailable',f.modelId==='sum_of_fitted_component_expectations'?'A joint combination probability model is required; component projections alone cannot produce EV':'Independent model probabilities needed');
 if(![p.overProbability,p.underProbability,p.pushProbability].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)||Math.abs(p.overProbability+p.underProbability+p.pushProbability-1)>1e-6)return missing('invalid_probabilities','Complete, normalized model probabilities needed');
 const selected=estimatedEv(row,now);
 if(selected.status==='available')return {...selected,code:null,quoteBasis:saved?'saved_pregame':'current',displayText:formatEvPercent(selected.percent)};
 // A stored selection which failed integrity checks cannot be silently switched
 // to a projection direction or repriced against another quote.
 if(f.modelSelection)return missing('selection_evidence_invalid',selected.reason||'Original selection evidence is invalid');
 if(!p.quoteEvidence)return missing('quote_binding_missing','Model probabilities are not bound to this exact sportsbook quote');
 const comparison=nbaComparisonEv(row,now);
 if(!comparison)return missing('quote_binding_or_timing_invalid','Forecast identity, exact line/prices or pregame timing does not match this quote');
 const projection=f.projection,line=row.sportsbookLine;
 if(typeof projection!=='number'||!Number.isFinite(projection))return missing('projection_unavailable','Original model projection needed to identify the displayed direction');
 if(projection===line)return missing('direction_unavailable','Projection equals the line; no OVER/UNDER direction is displayed');
 const side=projection>line?'OVER':'UNDER',percent=side==='OVER'?comparison.over:comparison.under;
 return {version:1 as const,status:'available' as const,code:null,reason:null,percent,side,line,odds:side==='OVER'?row.overPrice:row.underPrice,winProbability:side==='OVER'?p.overProbability:p.underProbability,lossProbability:side==='OVER'?p.underProbability:p.overProbability,pushProbability:p.pushProbability,quoteId:row.quoteId,sportsbookKey:row.sportsbookKey,calculatedAt:f.calculatedAt,quoteBasis:saved?'saved_pregame':'current',basis:'displayed_projection_direction_and_exact_quote',validatedForBetting:false,displayText:formatEvPercent(percent)};
}
export function nbaEvNotice(ev:ReturnType<typeof nbaRankingEv>){
 return ev.status==='available'?`Research EV at ${ev.quoteBasis==='saved_pregame'?'saved pregame':'current'} sportsbook odds; not validated for betting. Negative EV means expected loss, not a recommendation.`:ev.reason;
}
/** API enrichment is additive: no forecast, quote, rank or history is changed. */
export function attachNbaRankingEv<T extends {sport?:string;market?:string}>(rows:T[],now=Date.now()){
 return rows.map(row=>row.sport==='nba'&&nbaEvMarket(row.market||'')?{...row,nbaEv:nbaRankingEv(row,now)}:row);
}
