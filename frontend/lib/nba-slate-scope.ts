import {attachNbaRankingEv,nbaEvMarket} from '@/lib/nba-ranking-ev';
import {cardModelPick,cardModelProjection,savedModelPick} from '@/lib/saved-model-pick';
import {estimatedEv,nbaComparisonEv} from '@/lib/estimated-ev';
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
export function firstBasketBookOnly(row:any){
 return {...row,headshot:row.headshot||(/^\d+$/.test(String(row.playerId||''))?`https://a.espncdn.com/i/headshots/nba/players/full/${row.playerId}.png`:''),researchForecast:{status:'unavailable',projection:null,giScore:null,reason:'market_model_not_fitted',validatedForBetting:false},pregameProbability:null};
}
export function scopedNbaBoard(payload:any,market:string,day:string,now=Date.now()){
 // The API's boardDay is advisory: UTC/calendar cache rollover may label
 // the response differently from the Toronto fixture day. Scope by the
 // actual timestamp on every row instead of deleting valid late games.
 // A genuinely wrong market still cannot bleed across category tabs.
 const mismatch=Boolean(payload?.market&&payload.market!==market);
 const scopedRows=mismatch?[]:nbaSlateRows(payload?.rows||[],market,day);
 const rows=market==='first_basket'?scopedRows.map(firstBasketBookOnly):nbaEvMarket(market)?attachNbaRankingEv(scopedRows.map((row:any)=>({...row,sport:row.sport||'nba'})),now):scopedRows;
 const pickForAudit=(r:any)=>savedModelPick(r,String(r.market||'').startsWith('q1_')&&r.forecastCapturedAt?r.forecastCapturedAt:r.boardCapturedAt)||cardModelPick(r);
 const underCount=rows.filter((r:any)=>pickForAudit(r)?.side==='UNDER'||r.lineType==='milestone'&&r.researchForecast?.modelTargetForecast?.direction==='BELOW').length;
 const missingCardFields={line:rows.filter((r:any)=>r.quoteVerified!==true||!Number.isFinite(r.sportsbookLine)).length,prediction:rows.filter((r:any)=>!pickForAudit(r)&&!r.researchForecast?.modelTargetForecast).length,projection:rows.filter((r:any)=>cardModelProjection(r)==null).length,ev:rows.filter((r:any)=>nbaEvMarket(market)?r.nbaEv?.status!=='available':estimatedEv(r).status!=='available'&&!nbaComparisonEv(r)).length};
 if(market.startsWith('q1_'))console.info('[N05 NBA Q1 live card audit]',JSON.stringify({market,day,cards:rows.length,quotes:rows.filter((r:any)=>r.quoteVerified===true).length,predictions:rows.filter((r:any)=>pickForAudit(r)||r.researchForecast?.modelTargetForecast).length,projections:rows.filter((r:any)=>cardModelProjection(r)!=null).length,ev:rows.filter((r:any)=>estimatedEv(r).status==='available').length,forecastReasons:rows.reduce((a:Record<string,number>,r:any)=>{const key=String(r.researchForecast?.reason||r.researchForecast?.selectionReason||r.researchForecast?.status||'none');a[key]=(a[key]||0)+1;return a},{}),evReasons:rows.reduce((a:Record<string,number>,r:any)=>{const key=String(estimatedEv(r).reason||'available');a[key]=(a[key]||0)+1;return a},{})}));
 return {...payload,market,boardDay:day,rows,dropped:mismatch?[]:nbaSlateRows(payload?.dropped||[],market,day),publicRankingCount:rows.length,
  evDiagnostics:nbaEvMarket(market)?{available:rows.filter((r:any)=>r.nbaEv?.status==='available').length,unavailable:rows.filter((r:any)=>r.nbaEv?.status!=='available').length,reasons:rows.reduce((counts:Record<string,number>,r:any)=>{if(r.nbaEv?.status==='unavailable')counts[r.nbaEv.code]=(counts[r.nbaEv.code]||0)+1;return counts;},{})}:undefined,
  rankingAudit:{market,day,cards:rows.length,underCount,underCapExceeded:underCount>5,previouslyCaptured:rows.some((r:any)=>r.boardFrozen||r.boardCapturedAt),missingCardFields},
  verifiedQuoteCount:rows.filter((r:any)=>r.quoteVerified===true).length,
  modelSelectionCount:rows.filter((r:any)=>pickForAudit(r)||r.researchForecast?.modelTargetForecast).length,
  ...(market==='first_basket'?{forecastBlockers:{market_model_not_fitted:rows.length},fittedResearchForecastCount:0}:{}),
  ...(market.startsWith('q1_')?{q1Diagnostics:{cards:rows.length,quoted:rows.filter((r:any)=>r.quoteVerified===true).length,predictions:rows.filter((r:any)=>pickForAudit(r)||r.researchForecast?.modelTargetForecast).length,projections:rows.filter((r:any)=>cardModelProjection(r)!=null).length,ev:rows.filter((r:any)=>estimatedEv(r).status==='available').length}}:{})};
}
