/** Optional request-local hook installed only by the dashboard job runtime. */
type DashboardJobContext={id:string;assertActive:()=>void;acceptance?:{
 day:string;lock:number;expires:number;scheduleSha256:string;providerMode?:'owl-only';
}};
export function dashboardJobContext():DashboardJobContext|undefined{
 return (globalThis as typeof globalThis&{__sachDashboardJobContext?:()=>DashboardJobContext|undefined}).__sachDashboardJobContext?.();
}
