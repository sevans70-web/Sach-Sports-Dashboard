import type {CfbMarketKey} from "@/lib/cfb";

const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const logistic=(z:number)=>1/(1+Math.exp(-z));

export function cfbPredictionProbability(
 market:CfbMarketKey,projection:number|null,line:number|null,marketProb:number|null
):number|null{
 if(projection==null||line==null||!Number.isFinite(projection)||!Number.isFinite(line))return null;
 const marketP=marketProb!=null&&Number.isFinite(marketProb)?clamp(marketProb/100,.05,.95):.5;
 let histP=.5;
 if(market==="anytime_td"||market==="first_td"){
   histP=clamp(projection/100,.03,.97);
 }else if(market==="passing_tds"||market==="interceptions"||market==="sacks"){
   const scale=Math.max(.85,Math.sqrt(Math.max(1,projection))*1.05);
   histP=logistic((projection-line)/scale);
 }else if(market==="pass_completions"||market==="receptions"||market==="tackles"||market==="tackles_assists"){
   const scale=Math.max(2.75,Math.abs(line)*.20);
   histP=logistic((projection-line)/scale);
 }else{
   const scale=Math.max(18,Math.abs(line)*.28);
   histP=logistic((projection-line)/scale);
 }
 const blended=clamp(histP*.75+marketP*.25,.05,.95);
 return Math.round(blended*1000)/10;
}

export function cfbGiScore(prob:number,books:number,sample:number){
 const p=clamp(Number.isFinite(prob)?prob:50,1,99);
 const depth=Math.min(8,Math.max(0,books)*1.5);
 const history=Math.min(10,Math.max(0,sample)*.6);
 return Math.round(clamp(p*.82+depth+history,1,99)*10)/10;
}
