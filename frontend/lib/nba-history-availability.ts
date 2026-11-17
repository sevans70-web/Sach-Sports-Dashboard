/** A complete priced-player history outage is not a successfully empty slate. */
export function nbaHistoryUnavailable(board:any){
 const priced=Number(board?.quoteMatchAudit?.integrityVerifiedQuotes||board?.pricedForecastCandidates||0);
 const failed=Number(board?.forecastBlockers?.recent_official_history_unavailable||0);
 const fitted=Number(board?.fittedResearchForecastCount??board?.quoteMatchAudit?.fittedForecasts??0);
 return Array.isArray(board?.rows)&&board.rows.length===0&&priced>0&&failed>=priced&&fitted===0;
}
