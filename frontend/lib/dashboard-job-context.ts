import type {NbaEvidenceAccess} from '@/lib/nba-history-evidence';
/** Optional request-local hook installed only by the dashboard job runtime. */
type DashboardJobContext={id:string;assertActive:()=>void;readNbaEvidence?:NbaEvidenceAccess['read'];writeNbaEvidence?:NbaEvidenceAccess['write'];readInput?:(key:string)=>any;checkpointInput?:(key:string,value:any,progress:boolean)=>void;acceptance?:{
 day:string;lock:number;expires:number;scheduleSha256:string;
}};
export function dashboardJobContext():DashboardJobContext|undefined{
 return (globalThis as typeof globalThis&{__sachDashboardJobContext?:()=>DashboardJobContext|undefined}).__sachDashboardJobContext?.();
}
