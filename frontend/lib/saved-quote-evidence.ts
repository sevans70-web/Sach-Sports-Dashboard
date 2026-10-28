import {estimatedEv} from '@/lib/estimated-ev';
/** One exact fixture/quote, preferring the immutable featured choice then the earliest authenticated board. */
export function selectSavedQuoteEvidence(rows:any[],gameId?:string|null,quoteId?:string|null,now=Date.now(),forecastAt?:string|null){
 const matched=rows.filter(r=>(!gameId||String(r.gameId)===gameId)&&(!quoteId||r.quoteId===quoteId)&&(!forecastAt||r.researchForecast?.modelSelection?.calculatedAt===forecastAt));
 const games=new Set(matched.map(r=>String(r.gameId))),candidates=matched.some(r=>r._featured)?matched.filter(r=>r._featured):matched;
 const quotes=new Set(candidates.map(r=>r.quoteId));
 if((!gameId&&games.size>1)||(!quoteId&&quotes.size>1))return {row:null,ambiguous:true};
 const time=(r:any)=>Date.parse(r.boardCapturedAt||r.featuredSavedAt||r.savedAt||r.researchForecast?.modelSelection?.calculatedAt||'');
 const sorted=[...candidates].sort((a,b)=>(Number.isFinite(time(a))?time(a):Infinity)-(Number.isFinite(time(b))?time(b):Infinity));
 return {row:sorted.find(r=>estimatedEv(r,now).status==='available')||sorted[0]||null,ambiguous:false};
}
/** Preserve identities in existing full-card links; never pass probability as evidence. */
export function savedQuoteQuery(row:any){
 const game=row?.gameId||row?.game_pk||row?.gamePk||row?.game_id,quote=row?.quoteId,forecastAt=row?.researchForecast?.modelSelection?.calculatedAt;
 return (game?'&gameId='+encodeURIComponent(String(game)):'')+(quote?'&quoteId='+encodeURIComponent(String(quote)):'')+(forecastAt?'&forecastAt='+encodeURIComponent(String(forecastAt)):'');
}
