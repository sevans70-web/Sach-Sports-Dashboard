/** Optional request-local hook installed only by the dashboard job runtime. */
export function dashboardJobContext():{id:string;assertActive:()=>void;readInput?:(key:string)=>any;checkpointInput?:(key:string,value:any,progress:boolean)=>void}|undefined{
 return (globalThis as typeof globalThis&{__sachDashboardJobContext?:()=>{id:string;assertActive:()=>void;readInput?:(key:string)=>any;checkpointInput?:(key:string,value:any,progress:boolean)=>void}|undefined}).__sachDashboardJobContext?.();
}
