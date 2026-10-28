export const PERFORMANCE_RESULTS=['all','hit','miss','push','pending','unknown','void'] as const;
export type PerformanceResultFilter=typeof PERFORMANCE_RESULTS[number];
/** Filter derived grades only. Never recover an unknown grade from legacyResult. */
export function filterPerformanceResults<T extends {status?:string}>(rows:T[],filter:PerformanceResultFilter){
 return filter==='all'?rows:rows.filter(r=>r.status===filter);
}
