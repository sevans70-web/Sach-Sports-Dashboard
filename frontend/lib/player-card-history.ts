import {datedCardHistoryPoints} from '@/lib/public-prop-context';
export type PlayerHistoryPoint={value:number;date?:string;opponent?:string;gameId?:string;period?:string};
const numeric=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
/** Missing statistics never become zeroes; fixture views use prior dated games only. */
export function playerCardHistory(payload:any,sport:string,market:string,before?:string,gameId?:string):PlayerHistoryPoint[]{
 const source=Array.isArray(payload?.points)?payload.points:Array.isArray(payload?.games)?payload.games:Array.isArray(payload?.values)?payload.values:[];
 const points=source.flatMap((p:any)=>{
  const value=numeric(p&&typeof p==='object'?p.value??p.actual??p.stat:p);
  return value==null?[]:[p&&typeof p==='object'?{...p,value}:{value}];
 });
 if(before)return datedCardHistoryPoints(points,before,market,sport,gameId);
 return points.filter((p:any)=>!market.startsWith('q1_')||p.period==='q1')
  .filter((p:any)=>!gameId||String(p.gameId)!==String(gameId))
  .sort((a:any,b:any)=>Date.parse(a.date)-Date.parse(b.date)).slice(-20);
}
export function historyAverage(points:PlayerHistoryPoint[]){
 return points.length?points.reduce((sum,p)=>sum+p.value,0)/points.length:null;
}
