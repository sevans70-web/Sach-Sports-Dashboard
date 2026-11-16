/** Read-only owner audit. Honest application identity per Cloudflare's workers.dev guidance.
 * Never sends provider keys, impersonates a browser, retries a denial or changes security. */
import {fileURLToPath} from 'node:url';
export const AUDIT_USER_AGENT='SachSports-ReleaseAudit/1.0';
const origin='https://sach-sports-cloudflare-test.sevans70.workers.dev';
export function summarizeAccess(body,now=Date.now()){
 const rows=Array.isArray(body?.rows)?body.rows:[];
 const fresh=rows.filter(r=>r.quoteVerified===true&&r.quoteVersion===1&&!r.boardFrozen&&r.lineType==='main'&&r.sportsbookKey&&r.gameId&&r.playerId&&typeof r.sportsbookLine==='number'&&Number.isFinite(r.sportsbookLine)&&[r.overPrice,r.underPrice].every(v=>typeof v==='number'&&Number.isFinite(v)&&Math.abs(v)>=100)&&Date.parse(r.gameTime)>now&&Date.parse(r.quoteUpdatedAt)<=now&&now-Date.parse(r.quoteUpdatedAt)<=900000);
 return {success:body?.success===true,source:body?.source||null,boardDay:body?.boardDay||null,rows:rows.length,freshVerifiedQuotes:fresh.length,latestQuoteAt:fresh.length?new Date(Math.max(...fresh.map(r=>Date.parse(r.quoteUpdatedAt)))).toISOString():null,accessEvidence:body?.success===true&&fresh.length?'fresh_dashboard_bound_quotes':rows.length?'retained_or_unpriced_rows_only':'no_fresh_evidence'};
}
export async function checkDashboardAccess(day,{fetcher=fetch,now=()=>Date.now()}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('Explicit NFL slate day required');
 const paths=[`/api/nfl/rankings?market=passing_yards&day=${day}`,'/api/nhl/rankings?market=shots_on_goal&slate=tomorrow'];
 const checks=[];
 for(const path of paths){
  const start=performance.now(),response=await fetcher(origin+path,{method:'GET',headers:{Accept:'application/json','User-Agent':AUDIT_USER_AGENT},signal:AbortSignal.timeout(35000)});
  const body=await response.json().catch(()=>null),observedAt=now();
  checks.push({path,status:response.status,ray:response.headers.get('cf-ray'),observedAt:new Date(observedAt).toISOString(),milliseconds:Math.round(performance.now()-start),...summarizeAccess(body,observedAt)});
  if([401,403,429].includes(response.status))break;
 }
 return {worker:'sach-sports-cloudflare-test',userAgent:AUDIT_USER_AGENT,method:'existing public dashboard route and actual Worker binding; no provider key in audit client',checks};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const result=await checkDashboardAccess(process.argv[2]);console.log(JSON.stringify(result,null,2));
 if(result.checks.length!==2||result.checks.some(c=>c.status!==200||!c.success||!c.freshVerifiedQuotes))process.exitCode=2;
}
