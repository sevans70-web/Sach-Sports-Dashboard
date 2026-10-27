import {dashboardDay} from '@/lib/dashboard-contract';
const side=(r:any)=>String(r.pickSide||r.prediction||r.pick||'').toUpperCase();
const time=(r:any)=>Date.parse(r.boardCapturedAt||r.savedAt||r.capturedAt||'');
const fixtureDay=(r:any)=>Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):String(r.gameDate||'');
/** Reconcile copies, never replace an original call with a later recalculation.
 * Official final statistics may grade that original exact line independently. */
export function reconcilePerformanceRecords(rows:any[]){
 const unique=new Map<string,any>();let duplicates=0,conflicts=0;
 const ordered=[...rows].sort((a,b)=>Number(b.performanceSource==='locked')-Number(a.performanceSource==='locked')||
  (Number.isFinite(time(a))&&Number.isFinite(time(b))?time(a)-time(b):0));
 for(const row of ordered){
  const key=row.gameId&&row.playerId?[fixtureDay(row),row.historySection||'',row.market,row.gameId,row.playerId].join('|'):row.key||[fixtureDay(row),row.market,row.gameId,row.playerId].join('|');
  const prior=unique.get(key);if(!prior){unique.set(key,{...row,key});continue;}duplicates++;
  if(side(prior)!==side(row)||prior.sportsbookLine!==row.sportsbookLine)conflicts++;
  // Only an explicitly authenticated final observation can settle another copy.
  if((prior.verifiedResult!==true||!Number.isFinite(Date.parse(prior.gradedAt))||Date.parse(row.gradedAt)>=Date.parse(prior.gradedAt))&&row.verifiedResult===true&&row.resultSource==='official_final_boxscore'&&typeof row.actual==='number'&&Number.isFinite(row.actual)&&
   ['OVER','UNDER'].includes(side(prior))&&typeof prior.sportsbookLine==='number'&&Number.isFinite(prior.sportsbookLine)){
   const actual=row.actual,line=prior.sportsbookLine;
   unique.set(key,{...prior,actual,status:actual===line?'push':(side(prior)==='OVER'?actual>line:actual<line)?'hit':'miss',
    verifiedResult:true,resultSource:row.resultSource,gradedAt:row.gradedAt});
  }
 }
 return {records:[...unique.values()],duplicates,conflicts};
}
