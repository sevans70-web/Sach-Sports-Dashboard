import {verifiedPropQuote} from '@/lib/prop-integrity';
import {savedModelPick} from '@/lib/saved-model-pick';
const unavailable=(reason:string)=>({version:1 as const,status:'unavailable' as const,percent:null,reason});
/** Expected net return per unit stake, including zero-profit pushes. Never use
 * bookmaker-implied chance as an independent forecast or GI as a probability. */
export function estimatedEv(row:any,now=Date.now()){
 const f=row?.researchForecast;
 if(f?.giReason==='price_validation_failed'||f?.selectionReason==='price_validation_failed')return unavailable('Probability accuracy checks not met');
 if(f?.status!=='available'||!f.priceComparison)return unavailable('Independent model probability needed');
 const start=Date.parse(row.gameTime||'');
 const capture=row.boardCapturedAt||row.featuredSavedAt||f.modelSelection?.calculatedAt;
 const saved=Date.parse(capture||''),decision=Date.parse(f.modelSelection?.calculatedAt||'');
 if(!Number.isFinite(start)||!Number.isFinite(saved)||!Number.isFinite(decision)||saved>=start||decision>saved||decision>=start||decision>now)return unavailable('Original pregame forecast needed');
 if(!verifiedPropQuote(row,saved,true))return unavailable('Verified pregame sportsbook quote needed');
 const pick=savedModelPick(row,capture);if(!pick)return unavailable('Supported OVER/UNDER selection needed');
 const comparison=f.priceComparison,over=comparison.overProbability,under=comparison.underProbability,push=comparison.pushProbability;
 if(![over,under,push].every(p=>typeof p==='number'&&Number.isFinite(p)&&p>=0&&p<=1)||Math.abs(over+under+push-1)>1e-6)return unavailable('Complete model probabilities needed');
 const odds=pick.price;if(typeof odds!=='number'||!Number.isFinite(odds)||Math.abs(odds)<100)return unavailable('Verified selection odds needed');
 const win=pick.side==='OVER'?over:under,loss=pick.side==='OVER'?under:over,profit=odds>0?odds/100:100/-odds;
 return {version:1 as const,status:'available' as const,percent:100*(win*profit-loss),reason:null,side:pick.side,line:pick.line,odds,winProbability:win,pushProbability:push,lossProbability:loss,sportsbook:row.sportsbook,sportsbookKey:row.sportsbookKey,quoteId:row.quoteId,gameId:row.gameId,playerId:row.playerId,calculatedAt:pick.calculatedAt,basis:'model_probability_and_exact_quote',validatedForBetting:false};
}
export function estimatedEvText(row:any,now=Date.now()){
 const ev=estimatedEv(row,now);if(ev.status!=='available')return '—';
 const percent=Math.round(ev.percent*10)/10;return `${percent>0?'+':''}${Object.is(percent,-0)?'0.0':percent.toFixed(1)}%`;
}
export function estimatedEvNotice(row:any,now=Date.now()){
 const ev=estimatedEv(row,now);return ev.status==='available'?'Expected net return per $100 at the saved pregame odds, based on model probabilities. Not a win probability or guaranteed profit.':ev.reason;
}
