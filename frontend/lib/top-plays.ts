import {eligiblePropPrediction} from '@/lib/prop-integrity';
import {dashboardDay} from '@/lib/dashboard-contract';

export function todayTopPlays(rows:any[],sport:string,now=Date.now()){
 const eligible=rows.filter(row=>eligiblePropPrediction(row,now)&&
  dashboardDay(row.gameTime)===dashboardDay(new Date(now))&&Date.parse(row.gameTime)>now&&
  !row.withdrawnFromBoard&&!['out','inactive'].includes(String(row.availabilityStatus||'').toLowerCase()));
 const priced=eligible.flatMap(row=>{
  const probability=row.modelProbability,price=row.prediction==='UNDER'?row.underPrice:row.overPrice;
  if(typeof probability!=='number'||!Number.isFinite(probability)||probability<=0||probability>=100||typeof price!=='number'||!Number.isFinite(price)||Math.abs(price)<100)return [];
  const profit=price>0?price/100:100/-price,p=probability/100;
  return [{row,probability,price,expectedReturn:p*profit-(1-p)}];
 });
 const best=(items:typeof priced,score:(item:typeof priced[number])=>number)=>[...items].sort((a,b)=>score(b)-score(a)||String(a.row.playerId).localeCompare(String(b.row.playerId)))[0]||null;
 return [
  {key:'play',title:'⭐ Play of the Day',pick:best(priced.filter(p=>p.probability>=60&&p.expectedReturn>0),p=>p.probability)},
  {key:'value',title:'💎 Best Value',pick:best(priced.filter(p=>p.expectedReturn>0),p=>p.expectedReturn)},
  ...(['nba','wnba','cbb'].includes(sport)?[{key:'first',title:'🏀 First Basket',pick:best(priced.filter(p=>p.row.market==='first_basket'),p=>p.probability)}]:[]),
  {key:'long',title:'🚀 Long Shot',pick:best(priced.filter(p=>p.price>=300&&p.expectedReturn>0),p=>p.expectedReturn)},
 ];
}
