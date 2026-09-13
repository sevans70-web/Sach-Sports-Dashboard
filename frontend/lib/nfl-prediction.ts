import type {NflMarketKey} from "@/lib/nfl";

const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const logistic=(z:number)=>1/(1+Math.exp(-z));

export function nflPredictionProbability(
  market:NflMarketKey,
  projection:number|null,
  line:number|null,
  marketProb:number|null
):number|null{
  const marketP=marketProb!=null&&Number.isFinite(marketProb)
    ? clamp(marketProb/100,.05,.95)
    : .5;

  if(market==="anytime_td"||market==="first_td"){
    // Current history route does not produce a trustworthy first-TD projection.
    // Until it does, do not relabel the book price as a model probability.
    if(projection==null)return null;
    const histP=clamp(projection/100,.03,.97);
    return Math.round(clamp(histP*.75+marketP*.25,.05,.95)*1000)/10;
  }

  if(projection==null||line==null||!Number.isFinite(projection)||!Number.isFinite(line))return null;

  let scale:number;
  if(market==="pass_completions"||market==="receptions"){
    scale=Math.max(2.75,Math.abs(line)*.20);
  }else{
    scale=Math.max(18,Math.abs(line)*.28);
  }

  const histP=logistic((projection-line)/scale);
  const blended=clamp(histP*.75+marketP*.25,.05,.95);
  return Math.round(blended*1000)/10;
}

export function nflGiScore(prob:number,books:number,sample:number){
  const p=clamp(Number.isFinite(prob)?prob:50,1,99);
  const depth=Math.min(8,Math.max(0,books)*1.5);
  const history=Math.min(10,Math.max(0,sample)*.6);
  return Math.round(clamp(p*.82+depth+history,1,99)*10)/10;
}
