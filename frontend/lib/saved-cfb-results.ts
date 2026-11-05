/** Toronto kickoff windows, independent of browser timezone or date. */
export function savedCfbWindow(time:string){
 const date=new Date(time);if(!Number.isFinite(date.getTime()))return null;
 const hour=Number(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',hour:'2-digit',hourCycle:'h23'}).format(date));
 return hour<15?'12 PM':hour<19?'Afternoon':'Evening';
}
export function savedCfbResult(row:any){
 const status=String(row.status||'').toLowerCase();
 return ({hit:'✅ HIT',miss:'❌ MISS',push:'➖ PUSH',void:'VOID',pending:'PENDING RESULT',unverified:'RESULT UNVERIFIED',research:'HISTORICAL FORECAST'})[status]||'RESULT NOT VERIFIED';
}
