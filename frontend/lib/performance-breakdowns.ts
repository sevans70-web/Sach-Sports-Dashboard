import {dashboardDay} from '@/lib/dashboard-contract';
import {savedHistorySummary} from '@/lib/saved-performance';

/** Original saved direction and fixture date only; never infer a new call. */
export function performanceBreakdowns(rows:any[]){
 const direction=(r:any)=>String(r.pickSide||r.prediction||r.pick||'').toUpperCase();
 const days=new Map<string,any[]>();
 for(const row of rows){
  const day=Number.isFinite(Date.parse(row.gameTime))?dashboardDay(row.gameTime):String(row.gameDate||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
  const items=days.get(day)||[];items.push(row);days.set(day,items);
 }
 return {
  directions:Object.fromEntries(['OVER','UNDER','OTHER'].map(side=>[side,savedHistorySummary(rows.filter(r=>side==='OTHER'?!['OVER','UNDER'].includes(direction(r)):direction(r)===side))])),
  daily:[...days].sort(([a],[b])=>b.localeCompare(a)).map(([day,items])=>({day,...savedHistorySummary(items)})),
 };
}

export function performanceRecordFreshness(rows:any[]){
 const latest=(key:string)=>{
  const values=rows.map(r=>r[key]).filter(v=>typeof v==='string'&&Number.isFinite(Date.parse(v)));
  return values.sort((a,b)=>Date.parse(b)-Date.parse(a))[0]||null;
 };
 return {latestSavedAt:latest('savedAt'),latestGradedAt:latest('gradedAt')};
}
