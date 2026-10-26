/** GI is opportunity strength, distinct from outcome probability and evidence
 * confidence. Learn expected unit return from earlier, exact-price decisions;
 * never turn a season average, win probability or arbitrary weights into GI. */
import {evaluatePrice,quoteProblem,forecastDistribution,type ExactQuote,type DistributionModel} from '@/lib/probability-forecast';
import type {OpportunityGame} from '@/lib/opportunity-backtest';
export type GiCalibrationRow={group?:string;observationId:string;gameId:string;decisionAt:string;settledAt:string;expectedReturn:number;unitReturn:number};
/** Derive GI training targets from the same exact quote and official actual.
 * Saved hit/miss flags, old GI, season averages and caller ROI are ignored. */
export function giCalibrationRow(target:OpportunityGame,quote:ExactQuote,values:number[],settledAt:string):GiCalibrationRow|null{
 if(quoteProblem(quote,target)||!Number.isFinite(target.actual)||!Number.isFinite(Date.parse(settledAt))||Date.parse(settledAt)<=Date.parse(target.gameTime))return null;
 const price=evaluatePrice(values,quote),side=price.overEv>=price.underEv?'OVER':'UNDER';
 const odds=side==='OVER'?quote.overPrice:quote.underPrice,win=side==='OVER'?target.actual>quote.line:target.actual<quote.line;
 const unitReturn=target.actual===quote.line?0:win?(odds>0?odds/100:100/-odds):-1;
 return {group:quote.sport+'|'+quote.market,observationId:[quote.sport,quote.market,quote.gameId,quote.playerId,quote.bookmaker,quote.quoteId,quote.line].join('|'),gameId:target.gameId,decisionAt:quote.decisionAt,settledAt,expectedReturn:Math.max(price.overEv,price.underEv),unitReturn};
}
export type GiArtifact={version:1;group?:string;trainedThrough:string;calibrationRows:number;fixtures:number;
 blocks:{maximumExpectedReturn:number;estimatedUnitReturn:number}[];positiveReturnReference:number[];
 validatedForBetting:false};
export function fitOpportunityStrength(rows:GiCalibrationRow[],availableAt:string):{artifact:GiArtifact|null;reason:string|null}{
 const groups=new Set(rows.map(row=>row.group||(/^(nfl|cfb|nba|wnba|cbb|nhl|soccer|mlb)\|/.test(row.observationId)?row.observationId.split('|').slice(0,2).join('|'):null)).filter(Boolean));
 if(groups.size>1)return {artifact:null,reason:'mixed_market_calibration'};
 const group=groups.size===1?[...groups][0]!:undefined;
 const at=Date.parse(availableAt);
 if(!Number.isFinite(at))throw Error('Invalid GI availability time');
 const ids=new Set<string>();for(const row of rows){if(!row.observationId||ids.has(row.observationId))throw Error('Missing or duplicate GI observation');ids.add(row.observationId)}
 if(rows.some(r=>!r.gameId||!Number.isFinite(r.expectedReturn)||!Number.isFinite(r.unitReturn)||r.unitReturn< -1||!Number.isFinite(Date.parse(r.decisionAt))||!Number.isFinite(Date.parse(r.settledAt))||Date.parse(r.decisionAt)>=Date.parse(r.settledAt)||Date.parse(r.settledAt)>=at))throw Error('Invalid or unavailable GI calibration outcome');
 const counts=new Map<string,number>();for(const r of rows)counts.set(r.gameId,(counts.get(r.gameId)||0)+1);
 if(rows.length<200||counts.size<30)return {artifact:null,reason:'insufficient_exact_price_calibration'};
 const sorted=[...rows].sort((a,b)=>a.expectedReturn-b.expectedReturn||a.decisionAt.localeCompare(b.decisionAt));
 type Block={maximumExpectedReturn:number;sum:number;weight:number};const blocks:Block[]=[];
 // Fixture-equal weights keep a crowded game from dominating the mapping.
 // Pool-adjacent-violators learns a monotone return curve without chosen GI
 // weights or thresholds fitted against later evaluation outcomes.
 for(const row of sorted){
  const weight=1/counts.get(row.gameId)!,last=blocks.at(-1);
  if(last?.maximumExpectedReturn===row.expectedReturn){last.sum+=weight*row.unitReturn;last.weight+=weight}
  else blocks.push({maximumExpectedReturn:row.expectedReturn,sum:weight*row.unitReturn,weight});
  while(blocks.length>1){const right=blocks.at(-1)!,left=blocks.at(-2)!;if(left.sum/left.weight<=right.sum/right.weight)break;
   blocks.splice(-2,2,{maximumExpectedReturn:right.maximumExpectedReturn,sum:left.sum+right.sum,weight:left.weight+right.weight});
  }
 }
 const mapping=blocks.map(b=>({maximumExpectedReturn:b.maximumExpectedReturn,estimatedUnitReturn:b.sum/b.weight}));
 const lookup=(value:number)=>mapping.find(b=>value<=b.maximumExpectedReturn)?.estimatedUnitReturn??mapping.at(-1)!.estimatedUnitReturn;
 const positiveReturnReference=sorted.map(r=>lookup(r.expectedReturn)).filter(r=>r>0).sort((a,b)=>a-b);
 return {artifact:{version:1,...(group?{group}:{}),trainedThrough:new Date(rows.reduce((latest,r)=>Math.max(latest,Date.parse(r.settledAt)),0)).toISOString(),calibrationRows:rows.length,fixtures:counts.size,
  blocks:mapping,positiveReturnReference,validatedForBetting:false},reason:null};
}
/** Complete experimental decision calculation from one frozen bookmaker quote.
 * Its outputs remain separate from the public validated-model registry. */
export function researchOpportunityDecision(model:DistributionModel,history:OpportunityGame[],target:Omit<OpportunityGame,'actual'|'workload'>,quote:ExactQuote,gi:GiArtifact|null){
 const issue=quoteProblem(quote,target);if(issue)return {forecast:null,candidatePick:null,candidateGi:null,reason:issue,validatedForBetting:false};
 const result=forecastDistribution(model,history,target,quote.decisionAt);
 if(!result.forecast)return {forecast:null,candidatePick:null,candidateGi:null,reason:result.reason,validatedForBetting:false};
 const price=evaluatePrice(result.forecast.values,quote),expectedReturn=Math.max(price.overEv,price.underEv);
 const strength=gi?opportunityStrength(gi,expectedReturn,quote.decisionAt):null;
 return {forecast:{expectedWorkload:result.forecast.expectedWorkload,projection:result.forecast.projection,
  overProbability:price.over,underProbability:price.under,pushProbability:price.push,conditionalWinProbability:price.conditionalWinProbability,expectedReturn},
  candidatePick:price.candidateSide&&strength?.estimatedUnitReturn!=null&&strength.estimatedUnitReturn>=.03?price.candidateSide:null,
  candidateGi:strength?.score??null,reason:!gi?'GI_exact_price_calibration_missing':strength?.reason||(!price.candidateSide?'insufficient_probability_or_value':strength?.estimatedUnitReturn!=null&&strength.estimatedUnitReturn<.03?'insufficient_calibrated_return':null),validatedForBetting:false};
}
export function opportunityStrength(artifact:GiArtifact,expectedReturn:number,decisionAt:string,expectedGroup?:string){
 if(expectedGroup&&artifact.group!==expectedGroup)return {score:null,estimatedUnitReturn:null,reason:'GI_calibration_scope_unverified'};
 const at=Date.parse(decisionAt),trained=Date.parse(artifact.trainedThrough);
 if(!Number.isFinite(at)||!Number.isFinite(trained)||at<=trained||!Number.isFinite(expectedReturn)||!artifact.blocks.length||artifact.blocks.some((b,i)=>!Number.isFinite(b.maximumExpectedReturn)||!Number.isFinite(b.estimatedUnitReturn)||i>0&&(b.maximumExpectedReturn<=artifact.blocks[i-1].maximumExpectedReturn||b.estimatedUnitReturn<artifact.blocks[i-1].estimatedUnitReturn))||artifact.positiveReturnReference.some(v=>!Number.isFinite(v)||v<=0))return {score:null,estimatedUnitReturn:null,reason:'GI_calibration_unavailable'};
 const estimate=artifact.blocks.find(b=>expectedReturn<=b.maximumExpectedReturn)?.estimatedUnitReturn??artifact.blocks.at(-1)!.estimatedUnitReturn;
 // One positive fitted return maps every positive opportunity to the same
 // midpoint (50). It has no ranking resolution, so withhold the score while
 // preserving the estimated return for diagnostics.
 if(new Set(artifact.positiveReturnReference).size<2)return {score:null,estimatedUnitReturn:estimate,reason:'GI_calibration_has_no_ranking_resolution'};
 if(estimate<=0||!artifact.positiveReturnReference.length)return {score:0,estimatedUnitReturn:estimate,reason:'no_positive_calibrated_opportunity'};
 const reference=artifact.positiveReturnReference,lower=reference.filter(v=>v<estimate).length,equal=reference.filter(v=>v===estimate).length;
 return {score:Math.round(100*(lower+.5*equal)/reference.length),estimatedUnitReturn:estimate,reason:null};
}
