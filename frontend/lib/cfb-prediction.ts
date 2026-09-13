import type {CfbMarketKey} from "@/lib/cfb";
export function cfbPredictionProbability(market:CfbMarketKey,projection:number|null,line:number|null,marketProb:number|null):number|null{
  if(projection==null||line==null)return null;
  if(market==="first_td"||market==="anytime_td")return marketProb??50;
  const scale=Math.max(Math.abs(line)*0.16,market==="pass_completions"||market==="receptions"?2.5:12);
  const edge=(projection-line)/scale;
  const model=100/(1+Math.exp(-edge));
  const blended=model*0.7+(marketProb??50)*0.3;
  return Math.round(Math.max(1,Math.min(99,blended))*10)/10;
}
export function cfbGiScore(prob:number,books:number,sample:number){
  const depth=Math.min(10,Math.max(0,books)*2);
  const history=Math.min(8,Math.max(0,sample)*0.8);
  return Math.round(Math.max(1,Math.min(99,prob*0.82+depth+history))*10)/10;
}
