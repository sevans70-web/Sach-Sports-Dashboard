import {cardModelPick,cardModelProjection} from '@/lib/saved-model-pick';
import {estimatedEv} from '@/lib/estimated-ev';
/** NBA display scope only. Original saved boards are never rewritten. */
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'});
export function nbaFixtureDay(value:any){
 const date=new Date(value);if(!value||!Number.isFinite(date.getTime()))return '';
 const parts=formatter.formatToParts(date),part=(type:string)=>parts.find(x=>x.type===type)?.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
export function nbaSlateRequest(market:string,slate:string,now=new Date()){
 const today=nbaFixtureDay(now),noon=Date.parse(today+'T12:00:00Z');
 const day=slate==='previous'?new Date(noon-86400000).toISOString().slice(0,10):slate==='tomorrow'?new Date(noon+86400000).toISOString().slice(0,10):today;
 // Calendar identity also separates active-slate caches across Toronto midnight.
 return `/api/nba/rankings?market=${encodeURIComponent(market)}&calendar=${today}${slate==='active'?'':`&day=${day}`}`;
}
export function nbaSlateRows(rows:any[],market:string,day:string){
 return (rows||[]).filter(row=>row.market===market&&nbaFixtureDay(row.gameTime)===day);
}
export function scopedNbaBoard(payload:any,market:string,day:string){
 const mismatch=Boolean(payload?.market&&payload.market!==market||payload?.boardDay&&payload.boardDay!==day);
 const rows=mismatch?[]:nbaSlateRows(payload?.rows||[],market,day);
 return {...payload,market,boardDay:day,rows,dropped:mismatch?[]:nbaSlateRows(payload?.dropped||[],market,day),publicRankingCount:rows.length,
  verifiedQuoteCount:rows.filter((r:any)=>r.quoteVerified===true).length,
  modelSelectionCount:rows.filter((r:any)=>cardModelPick(r)).length,
  ...(market.startsWith('q1_')?{q1Diagnostics:{cards:rows.length,quoted:rows.filter((r:any)=>r.quoteVerified===true).length,predictions:rows.filter((r:any)=>cardModelPick(r)||r.researchForecast?.modelTargetForecast).length,projections:rows.filter((r:any)=>cardModelProjection(r)!=null).length,ev:rows.filter((r:any)=>estimatedEv(r).status==='available').length}}:{})};
}
