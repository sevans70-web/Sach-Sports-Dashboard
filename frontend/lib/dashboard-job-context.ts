/** Optional request-local hook installed only by the dashboard job runtime. */
type JobContext={id:string;assertActive:()=>void;readInput?:(key:string)=>any;checkpointInput?:(key:string,value:any,progress:boolean)=>void;readNbaEvidence?:(source:string)=>import('@/lib/nba-history-evidence').NbaHistoryEvidence|null;writeNbaEvidence?:(value:import('@/lib/nba-history-evidence').NbaHistoryEvidence)=>boolean};
export function dashboardJobContext():JobContext|undefined{
 return (globalThis as typeof globalThis&{__sachDashboardJobContext?:()=>JobContext|undefined}).__sachDashboardJobContext?.();
}
