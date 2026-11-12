import {verifiedPropQuote} from '@/lib/prop-integrity';
import {savedModelPick} from '@/lib/saved-model-pick';
import {quarterTargetDisplay} from '@/lib/quarter-target-display';
const unavailable=(reason:string)=>({version:1 as const,status:'unavailable' as const,percent:null,reason});
/** Expected net return per unit stake, including zero-profit pushes. Never use
 * bookmaker-implied chance as an independent forecast or GI as a probability. */
export function estimatedEv(row:any,now=Date.now()){
 const f=row?.researchForecast;
 if(f?.giReason==='price_validation_failed'||f?.selectionReason==='price_validation_failed')return unavailable('Probability accuracy checks not met');
 if(f?.status!=='available'||!f.priceComparison)return unavailable('Independent model probability needed');
 const start=Date.parse(row.gameTime||'');
 const capture=row?.forecastCapturedAt?row.forecastCapturedAt:row.boardCapturedAt||row.featuredSavedAt||f.modelSelection?.calculatedAt;
 const saved=Date.parse(capture||''),decision=Date.parse(f.modelSelection?.calculatedAt||f.modelTargetForecast?.calculatedAt||'');
 if(!Number.isFinite(start)||!Number.isFinite(saved)||!Number.isFinite(decision)||saved>=start||decision>saved||decision>=start||decision>now)return unavailable('Original pregame forecast needed');
 if(!verifiedPropQuote(row,saved,true))return unavailable('Verified pregame sportsbook quote needed');
 const milestone=String(row?.market||'').startsWith('q1_')&&row?.lineType==='milestone'&&quarterTargetDisplay(row,now);
 const pick=milestone?{side:'OVER',line:row.sportsbookLine,price:row.overPrice,calculatedAt:f.modelTargetForecast.calculatedAt}:savedModelPick(row,capture);
 if(!pick)return unavailable('Supported OVER/UNDER selection needed');
 const comparison=f.priceComparison,over=comparison.overProbability,under=comparison.underProbability,push=comparison.pushProbability;
 if(![over,under,push].every(p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1)||Math.abs(over+under+push-1)>1e-6)return unavailable('Complete model probabilities needed');
 const odds=pick.price;if(typeof odds!=='number'||!Number.isFinite(odds)||Math.abs(odds)<100)return unavailable('Verified selection odds needed');
 const win=pick.side==='OVER'?over:under,loss=pick.side==='OVER'?under:over,profit=odds>0?odds/100:100/-odds;
 return {version:1 as const,status:'available' as const,percent:100*(win*profit-loss),reason:null,side:pick.side,line:pick.line,odds,winProbability:win,pushProbability:push,lossProbability:loss,sportsbook:row.sportsbook,sportsbookKey:row.sportsbookKey,quoteId:row.quoteId,gameId:row.gameId,playerId:row.playerId,calculatedAt:pick.calculatedAt,basis:'model_probability_and_exact_quote',validatedForBetting:false};
}
export function nbaComparisonEv(row:any,now=Date.now()){
 const forecast=row?.researchForecast,comparison=forecast?.priceComparison,binding=comparison?.quoteEvidence;
 if(row?.sport!=='nba'||row.lineType!=='main'||forecast?.status!=='available'||forecast.modelSelection||
  forecast.giReason==='price_validation_failed'||forecast.selectionReason==='price_validation_failed'||!binding)return null;
 const decision=Date.parse(forecast.calculatedAt||''),start=Date.parse(row.gameTime||'');
 const capture=Date.parse(row.forecastCapturedAt||row.boardCapturedAt||forecast.calculatedAt||'');
 if(![decision,start,capture].every(Number.isFinite)||decision>now||capture>now||decision>capture||capture>=start||
  decision<Date.parse(row.quoteUpdatedAt||'')||!verifiedPropQuote({...row,boardCapturedAt:new Date(capture).toISOString()},capture,true))return null;
 if(binding.sport!=='nba'||binding.market!==row.market||binding.gameId!==String(row.gameId)||binding.playerId!==String(row.playerId)||
  binding.quoteId!==row.quoteId||binding.sportsbookKey!==row.sportsbookKey||binding.line!==row.sportsbookLine||
  binding.overPrice!==row.overPrice||binding.underPrice!==row.underPrice||Date.parse(binding.calculatedAt)!==decision)return null;
 const {overProbability:over,underProbability:under,pushProbability:push}=comparison;
 if(![over,under,push].every(p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1)||Math.abs(over+under+push-1)>1e-6)return null;
 const payout=(odds:number)=>odds>0?odds/100:100/-odds;
 return {over:100*(over*payout(row.overPrice)-under),under:100*(under*payout(row.underPrice)-over)};
}
/** One research EV for the direction ALREADY displayed on an NBA card.
 * This is not a qualifying pick: a negative return stays negative, and no
 * side is chosen merely because it has the higher EV.
 */
export function nbaDisplayedResearchEv(row:any,now=Date.now()){
 const comparison=nbaComparisonEv(row,now);
 const projection=row?.researchForecast?.projection, line=row?.sportsbookLine;
 if(!comparison||typeof projection!=='number'||!Number.isFinite(projection)||
    typeof line!=='number'||!Number.isFinite(line)||projection===line)return null;
 const side=projection>line?'OVER':'UNDER';
 const percent=side==='OVER'?comparison.over:comparison.under;
 // A negative or zero research return is an abstention, never a ranked EV.
 // Do NOT silently switch to the opposite side: it has its own independent
 // probability, price and eligibility checks.
 if(!Number.isFinite(percent)||percent<=0)return null;
 return {side,percent,basis:'projection_direction_and_original_quote',validatedForBetting:false};
}
export function formatEvPercent(value:number){
 const percent=Math.round(value*10)/10;return `${percent>0?'+':''}${Object.is(percent,-0)?'0.0':percent.toFixed(1)}%`;
}
export function estimatedEvText(row:any,now=Date.now()){
 const ev=estimatedEv(row,now);return ev.status==='available'?formatEvPercent(ev.percent):'—';
}
export function estimatedEvNotice(row:any,now=Date.now()){
 const ev=estimatedEv(row,now);return ev.status==='available'?(String(row?.market||'').startsWith('q1_')?'Research EV from held-out quarter prediction residuals and verified sportsbook odds; not independently validated for betting.':'Expected net return per $100 at the saved pregame odds, based on model probabilities. Not a win probability or guaranteed profit.'):ev.reason;
}
