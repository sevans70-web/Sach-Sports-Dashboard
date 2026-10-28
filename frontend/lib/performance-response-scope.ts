import {historyDays} from '@/lib/saved-performance';
import {dashboardDay} from '@/lib/dashboard-contract';
import {reconcilePerformanceRecords} from '@/lib/performance-reconciliation';
import {reviewPerformanceGrade} from '@/lib/performance-grade-review';
/** Reapply scope even to older cached views. Only derived copies are changed. */
export function performanceResponseScope(rows:any[],period:string,now=new Date(),league:string|null=null){
 const days=historyDays(period,now);
 return reconcilePerformanceRecords(rows.filter(r=>!league||r.league===league)).records.map(reviewPerformanceGrade).map(r=>r.withdrawnFromBoard?{...r,status:'void',legacyResult:r.legacyResult||r.status}:r).filter(r=>(!league||r.league===league)&&days.has(Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):String(r.gameDate||'')));
}
