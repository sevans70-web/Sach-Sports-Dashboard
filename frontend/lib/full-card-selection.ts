/** Only server-returned saved evidence may label a full-card selection. URL
 * directions and odds remain display context, never verification evidence. */
export function fullCardSelection(payload:any,identity:{playerId:string;gameId?:string;quoteId?:string;forecastAt?:string}){
 const e=payload?.ev;
 if(!identity.gameId||!identity.quoteId||e?.status!=='available'||String(e.playerId)!==identity.playerId||String(e.gameId)!==identity.gameId||e.quoteId!==identity.quoteId||!['OVER','UNDER'].includes(e.side)||!Number.isFinite(e.line)||!Number.isFinite(e.odds)||Math.abs(e.odds)<100||(identity.forecastAt&&e.calculatedAt!==identity.forecastAt))return null;
 return {side:e.side,line:e.line,odds:e.odds,sportsbook:e.sportsbook,quoteId:e.quoteId};
}

export function fullCardForecast(payload:any,identity:{playerId:string;gameId?:string;quoteId?:string}){
 const f=payload?.forecast;
 if(!identity.gameId||!identity.quoteId||String(f?.playerId)!==identity.playerId||String(f?.gameId)!==identity.gameId||f?.quoteId!==identity.quoteId||!Number.isFinite(f?.projection)||!Number.isFinite(f?.line))return null;
 return f;
}
