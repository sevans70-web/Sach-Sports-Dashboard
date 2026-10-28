/** Derived presentation only: never infer an original call from its projection. */
export function reviewPerformanceGrade(row:any){
 if(!['hit','miss','push'].includes(row.status))return row;
 const side=String(row.pickSide||row.prediction||row.pick||'').toUpperCase();
 const scorer=['anytime_td','first_td','first_basket'].includes(row.market);
 const validSide=scorer?['OVER','UNDER','YES','NO','FIRST BASKET'].includes(side):['OVER','UNDER'].includes(side);
 if(validSide&&typeof row.actual==='number'&&Number.isFinite(row.actual)&&(scorer||typeof row.sportsbookLine==='number'&&Number.isFinite(row.sportsbookLine)))return row;
 return {...row,status:'unknown',legacyResult:row.legacyResult||row.status,reviewReason:'Original grading terms are incomplete. Legacy result is preserved and excluded from hit-rate totals.'};
}
