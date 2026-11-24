/** Binary price calibration is conditional on settlement: a push refunds the
 * stake and is excluded from binary Brier. Pricing EV still uses unconditional
 * win/loss/push mass. This helper never changes forecasts or live prices. */
export function conditionalPriceScore(p:{over:number;under:number;push:number},actual:number,line:number,bookOver:number){
 if(![p.over,p.under,p.push].every(v=>Number.isFinite(v)&&v>=0&&v<=1)||Math.abs(p.over+p.under+p.push-1)>1e-9||
  !Number.isFinite(actual)||!Number.isFinite(line)||!Number.isFinite(bookOver)||bookOver<0||bookOver>1)throw Error('Invalid conditional price score');
 const mass=p.over+p.under,conditionalOver=mass>0?p.over/mass:null,push=actual===line;
 // Never improve an audit by silently discarding an impossible nonpush result.
 if(!push&&conditionalOver==null)throw Error('No nonpush probability for settled outcome');
 const outcome=actual>line?1:0;
 return {push,conditionalOver,modelBrier:push?null:(conditionalOver!-outcome)**2,bookBrier:push?null:(bookOver-outcome)**2};
}
