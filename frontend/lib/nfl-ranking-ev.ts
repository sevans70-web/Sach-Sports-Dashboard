import {estimatedEv,rankedModelComparison} from '@/lib/estimated-ev';
import {verifiedPropQuote} from '@/lib/prop-integrity';

const missing=(code:string,reason:string)=>({version:1 as const,status:'unavailable' as const,percent:null,code,reason});
const modelReasons:Record<string,string>={
 market_model_not_fitted:'A fitted forecast is not available for this market',
 recent_official_history_unavailable:'Recent official player history is unavailable',
 player_team_history_unavailable:'Verified player/team history is unavailable',
 fewer_than_three_same_season_team_appearances:'At least three verified same-season, same-team appearances are needed',
 prior_workload_role_uncertain:'Previous workload does not establish a stable role',
 fewer_than_five_quarter_history_games:'At least five verified quarter-history games are needed',
 reported_unavailable:'Player is reported unavailable',
 missing_exact_pregame_context:'Exact pregame matchup evidence is missing',
};
/** NFL-only view diagnostics. Reuse the existing exact-quote pricing gates;
 * never waive a failed probability audit or create a betting selection. */
export function nflRankingEv(row:any,now=Date.now()){
 const f=row?.researchForecast,market=String(row?.market||'');
 if(row?.sport!=='nfl')return missing('unsupported_sport','NFL price evidence is required');
 if(f?.giReason==='price_validation_failed'||f?.selectionReason==='price_validation_failed')return missing('probability_validation_failed','Model probability accuracy checks not met; confidence and EV are unavailable');
 if(f?.status!=='available')return missing('model_unavailable',modelReasons[f?.reason]||'An independent model probability is unavailable');
 if(f.modelGroup&&f.modelGroup!=='nfl|'+market)return missing('model_identity_mismatch','Forecast belongs to another sport or market');
 if(row.officialHistoryUnavailable===true)return missing('history_unavailable','Official player history is unavailable; no new confidence or EV can be calculated');
 if(row.quoteMarket&&row.quoteMarket!==market||row.quotePeriod&&row.quotePeriod!==(market.startsWith('q1_')?'q1':'game'))return missing('quote_identity_mismatch','Sportsbook market or period does not match the forecast');
 const saved=row.boardFrozen===true;
 if(!verifiedPropQuote(row,now,saved))return missing('quote_unavailable',saved?'Verified original pregame sportsbook quote needed':'Current complete sportsbook odds needed (maximum age 15 minutes)');
 const p=f.priceComparison;
 if(!p)return missing('probability_unavailable',f.priceEvidence?.reason?'Exact quote validation failed: '+f.priceEvidence.reason:'Independent model probabilities for this exact quote are unavailable');
 if([p.overProbability,p.underProbability,p.pushProbability].some(v=>v==null))return missing('probability_unavailable','Complete independent win/loss/push probabilities are unavailable');
 if(![p.overProbability,p.underProbability,p.pushProbability].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)||Math.abs(p.overProbability+p.underProbability+p.pushProbability-1)>1e-6)return missing('invalid_probabilities','Complete normalized win/loss/push probabilities are needed');
 if(!p.quoteEvidence)return missing('quote_binding_missing','Model probabilities are not bound to this exact sportsbook quote');
 const selected=estimatedEv(row,now);
 if(selected.status==='available')return {...selected,code:null};
 if(f.modelSelection)return missing('selection_evidence_invalid',selected.reason||'Original selection evidence does not match this quote');
 if(typeof f.projection!=='number'||!Number.isFinite(f.projection))return missing('projection_unavailable','An independent projection is needed');
 if(f.projection===row.sportsbookLine)return missing('direction_unavailable','Projection equals the line; no OVER/UNDER direction is displayed');
 const comparison=rankedModelComparison(row,now);
 if(!comparison)return missing('quote_binding_or_timing_invalid','Forecast identity, exact line/prices or pregame decision time does not match this quote');
 return {version:1 as const,status:'available' as const,code:null,reason:null,percent:comparison.percent,side:comparison.side,
  basis:'displayed_projection_direction_and_exact_quote',validatedForBetting:false};
}
