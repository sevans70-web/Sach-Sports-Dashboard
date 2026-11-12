import {datedCardHistoryPoints} from '@/lib/public-prop-context';
export type PlayerHistoryPoint={value:number;date?:string;opponent?:string;opponentAbbr?:string;gameId?:string;period?:string;minutes?:number|string;iceTimeSeconds?:number;workload?:number;fieldGoalAttempts?:number;freeThrowAttempts?:number;threePointAttempts?:number;shots?:number;shotsAgainst?:number;carries?:number;targets?:number};
const numeric=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
/** Missing statistics never become zeroes; fixture views use prior dated games only. */
export function playerCardHistory(payload:any,sport:string,market:string,before?:string,gameId?:string,chart=false,limit=20):PlayerHistoryPoint[]{
 const source=Array.isArray(payload?.points)?payload.points:Array.isArray(payload?.games)?payload.games:Array.isArray(payload?.values)?payload.values:[];
 const points=source.flatMap((p:any)=>{
  const value=numeric(p&&typeof p==='object'?p.value??p.actual??p.stat:p);
  return value==null?[]:[p&&typeof p==='object'?{...p,value}:{value}];
 });
 if(before)return datedCardHistoryPoints(points,before,market,sport,gameId,chart,limit);
 return points.filter((p:any)=>!market.startsWith('q1_')||p.period==='q1')
  .filter((p:any)=>!gameId||String(p.gameId)!==String(gameId))
  .sort((a:any,b:any)=>Date.parse(a.date)-Date.parse(b.date)).slice(-limit);
}
export function historyAverage(points:PlayerHistoryPoint[]){
 return points.length?points.reduce((sum,p)=>sum+p.value,0)/points.length:null;
}


export type PlayerChartGame={gameId:string;date:string;opponent:string};
export function playerChartSlots(points:PlayerHistoryPoint[],games:PlayerChartGame[],span:number){
 const recorded=new Map(points.filter(point=>point.gameId).map(point=>[point.gameId,point]));
 const fixtures=new Map(games.map(game=>[game.gameId,game]));
 // Include appearances from a prior team when they fall inside this window.
 const merged=[...fixtures.values()].map(game=>({ ...game,value:recorded.get(game.gameId)?.value??null }));
 for(const point of points)if(!point.gameId||!fixtures.has(point.gameId))merged.push({
  gameId:point.gameId||'',date:point.date||'',opponent:point.opponent||'',value:point.value,
 });
 const selected=merged.sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-span);
 return [...Array.from({length:span-selected.length},()=>({gameId:'',date:'',opponent:'',value:null})),...selected];
}
