import {evaluateProbabilityPrice,type ExactQuote} from '@/lib/probability-forecast';

export const NHL_COUNT_POLICY='nhl-count-poisson-candidate-v1';
export const nhlCountMarket=(sport:string,market:string)=>sport==='nhl'&&['goals','assists'].includes(market);

/** Candidate count likelihood, not additive rounded pooled errors. A zero-game
 * probability must vary continuously with the expected count. This assumption
 * still needs calibration and exact-price validation before producing picks. */
export function nhlCountDistribution(mean:number){
 if(!Number.isFinite(mean)||mean<0||mean>100)throw Error('Invalid NHL expected count');
 const masses:number[]=[];let mass=Math.exp(-mean),sum=0;
 for(let k=0;k<=256;k++){
  if(k)mass*=mean/k;
  masses.push(mass);sum+=mass;
  if(k>=mean&&1-sum<1e-14)break;
 }
 if(sum<1-1e-12)throw Error('NHL count tail did not converge');
 // Normalize only numerical roundoff in the negligible truncated tail.
 const probabilities=masses.map(p=>p/sum);
 return {probabilities,values:Array.from({length:1001},(_,i)=>{
  const q=(i+.5)/1001;let cumulative=0;
  for(let k=0;k<probabilities.length;k++){cumulative+=probabilities[k];if(cumulative>=q)return k;}
  return probabilities.length-1;
 })};
}
export function nhlCountProbabilities(mean:number,line:number){
 if(!Number.isFinite(line))throw Error('Invalid NHL line');
 const {probabilities}=nhlCountDistribution(mean);let over=0,under=0,push=0;
 probabilities.forEach((p,k)=>{if(k>line)over+=p;else if(k<line)under+=p;else push+=p;});
 const total=over+under+push;
 return {over:over/total,under:under/total,push:push/total};
}
/** No OVER/UNDER quota or minimum 55% hit chance. The same 3% EV threshold
 * applies to either side, including a lower-probability positive-price OVER.
 * Research evaluation only; the runtime separately withholds unvalidated picks. */
export function evaluateNhlCountPrice(mean:number,quote:ExactQuote){
 return evaluateProbabilityPrice(nhlCountProbabilities(mean,quote.line),quote,0);
}
