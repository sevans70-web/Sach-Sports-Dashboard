import {eligiblePropPrediction,verifiedPropQuote} from '@/lib/prop-integrity';
import {cardModelPick} from '@/lib/saved-model-pick';
import {dashboardDay} from '@/lib/dashboard-contract';

export function topPlayDay(rows:any[],now=Date.now()){
 const today=dashboardDay(new Date(now));
 const days=[...new Set(rows.map(r=>dashboardDay(r.gameTime)).filter(d=>d&&d>=today))].sort();
 return days.includes(today)?today:days[0]||today;
}
export function todayTopPlays(rows:any[],sport:string,now=Date.now()){
 const slateDay=topPlayDay(rows,now);
 const eligible=rows.filter(row=>
  dashboardDay(row.gameTime)===slateDay&&Date.parse(row.gameTime)>now&&
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
 const scorers=eligible.flatMap(row=>{
  if(row.lineType!=='scorer'||!verifiedPropQuote(row,now,row.boardFrozen===true))return [];
  const price=row.overPrice,probability=price>0?10000/(price+100):100*-price/(-price+100);
  return [{row:{...row,prediction:row.market==='first_basket'?'FIRST BASKET':'YES'},probability:Math.round(probability*10)/10,price,expectedReturn:0,basis:'bookmaker_implied'}];
 });

 const used=new Set<string>();
 const identity=(p:any)=>String(p.row.playerId||p.row.playerName).trim().toLowerCase();
 const take=(pick:any)=>{if(!pick||used.has(identity(pick)))return null;used.add(identity(pick));return pick};
 const best=(items:typeof priced,score:(item:typeof priced[number])=>number)=>[...items].filter(p=>!used.has(identity(p))).sort((a,b)=>score(b)-score(a)||String(a.row.playerId).localeCompare(String(b.row.playerId)))[0]||null;
 return [
  {key:'play',title:'⭐ Play of the Day',pick:take(best(priced.filter(p=>p.probability>=60&&p.expectedReturn>0),p=>p.probability))},
  {key:'value',title:'💎 Best Value',pick:take(best(priced.filter(p=>p.expectedReturn>0),p=>p.expectedReturn))},
  ...(['nba','wnba','cbb'].includes(sport)?[{key:'first',title:'🏀 First Basket',pick:take(best(scorers.filter(p=>p.row.market==='first_basket'),p=>p.probability))}]:[]),
  {key:'long',title:'🚀 Long Shot',pick:take(best(priced.filter(p=>p.price>=300&&p.expectedReturn>0),p=>p.expectedReturn)||best(scorers.filter(p=>p.price>=300),p=>p.probability))},
 ];
}

/** Guard saved/retained responses as well as new selections. */
export function distinctFeaturedPlayers<T extends {pick:any}>(cards:T[]):T[]{
 const seen=new Set<string>();return cards.map(card=>{if(!card.pick)return card;const row=card.pick.row,key=String(row.playerId||row.playerName).trim().toLowerCase();if(seen.has(key))return {...card,pick:null};seen.add(key);return card});
}
