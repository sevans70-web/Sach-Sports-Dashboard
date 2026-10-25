import {eligiblePropPrediction} from '@/lib/prop-integrity';
import {cardModelPick} from '@/lib/saved-model-pick';
import {firstBasketQuote} from '@/lib/public-card-metrics';
import {dashboardDay} from '@/lib/dashboard-contract';

export function todayTopPlays(rows:any[],sport:string,now=Date.now()){
 const eligible=rows.filter(row=>
  dashboardDay(row.gameTime)===dashboardDay(new Date(now))&&Date.parse(row.gameTime)>now&&
  !row.withdrawnFromBoard&&!['out','inactive'].includes(String(row.availabilityStatus||'').toLowerCase()));
 const priced=eligible.flatMap(row=>{
  const saved=cardModelPick(row,now),approved=eligiblePropPrediction(row,now);
  if(!saved&&!approved)return [];
  const side=saved?.side||row.prediction,comparison=row.researchForecast?.priceComparison;
  const probability=saved?(side==='UNDER'?comparison?.underProbability:comparison?.overProbability)*100:row.modelProbability;
  const price=saved?.price??(side==='UNDER'?row.underPrice:row.overPrice);
  if(typeof probability!=='number'||!Number.isFinite(probability)||probability<=0||probability>=100||typeof price!=='number'||!Number.isFinite(price)||Math.abs(price)<100)return [];
  const profit=price>0?price/100:100/-price,p=probability/100;
  const expectedReturn=saved?(side==='UNDER'?comparison?.underExpectedReturn:comparison?.overExpectedReturn):p*profit-(1-p);
  if(typeof expectedReturn!=='number'||!Number.isFinite(expectedReturn))return [];
  return [{row:{...row,prediction:side},probability,price,expectedReturn,basis:'model' as string}];
 });
 const first=eligible.flatMap(row=>{const q=firstBasketQuote(row,now);return q?[{row:{...row,prediction:'FIRST BASKET'},probability:q.probability,price:q.price,expectedReturn:0,basis:'bookmaker_implied'}]:[]}).sort((a,b)=>b.probability-a.probability)[0]||null;
 const best=(items:typeof priced,score:(item:typeof priced[number])=>number)=>[...items].sort((a,b)=>score(b)-score(a)||String(a.row.playerId).localeCompare(String(b.row.playerId)))[0]||null;
 return [
  {key:'play',title:'⭐ Play of the Day',pick:best(priced.filter(p=>p.probability>=60&&p.expectedReturn>0),p=>p.probability)},
  {key:'value',title:'💎 Best Value',pick:best(priced.filter(p=>p.expectedReturn>0),p=>p.expectedReturn)},
  ...(['nba','wnba','cbb'].includes(sport)?[{key:'first',title:'🏀 First Basket',pick:first}]:[]),
  {key:'long',title:'🚀 Long Shot',pick:best(priced.filter(p=>p.price>=300&&p.expectedReturn>0),p=>p.expectedReturn)},
 ];
}
