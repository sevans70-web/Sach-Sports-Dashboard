/** Optional request-local hook installed only by the dashboard job runtime. */
export function dashboardJobContext():{id:string;assertActive:()=>void}|undefined{
 return (globalThis as typeof globalThis&{__sachDashboardJobContext?:()=>{id:string;assertActive:()=>void}|undefined}).__sachDashboardJobContext?.();
}
