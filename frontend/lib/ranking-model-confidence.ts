import {nbaEvMarket,nbaRankingEv} from '@/lib/nba-ranking-ev';
import {nflRankingDisplay} from '@/lib/nfl-ranking-display';
import {completeRankingProp} from '@/lib/public-card-metrics';
import {estimatedEv} from '@/lib/estimated-ev';
/** View-only probability of the displayed direction. An abstention may have
 * valid exact-price research probabilities; it never becomes a betting pick. */
export function rankingModelConfidence(row:any,now=Date.now()){
 const unavailable=(reason:string)=>({status:'unavailable' as const,reason});
 if(!['nba','nfl','nhl'].includes(row?.sport))return unavailable('Model confidence is not supported here');
 let side:string|undefined;
 if(row.sport==='nba'&&nbaEvMarket(row.market)){
  const ev=nbaRankingEv(row,now);if(ev.status!=='available')return unavailable(ev.reason);side=ev.side;
 }else if(row.sport==='nfl'){
  const display=nflRankingDisplay(row,now);if(!display||display.ev.status!=='available')return unavailable(display?.reason||'An exact-quote model probability is unavailable');side=display.ev.side;
 }else{
  const complete=completeRankingProp(row,now);if(!complete)return unavailable(estimatedEv(row,now).reason||'An exact-quote model probability is unavailable');side=complete.side;
 }
 const p=row.researchForecast?.priceComparison;
 if(!['OVER','UNDER'].includes(side||'')||!p||![p.overProbability,p.underProbability,p.pushProbability].every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)||Math.abs(p.overProbability+p.underProbability+p.pushProbability-1)>1e-6)return unavailable('Complete normalized model probabilities are unavailable');
 return {status:'available' as const,side:side!,winProbability:side==='OVER'?p.overProbability:p.underProbability,pushProbability:p.pushProbability,validatedForBetting:false};
}
