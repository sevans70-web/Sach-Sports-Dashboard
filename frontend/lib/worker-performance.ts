import {env} from 'cloudflare:workers';
export const workerPerformanceSport=(sport:string)=>['nba','nfl','nhl'].includes(sport)&&globalThis.navigator?.userAgent==='Cloudflare-Workers';
type Namespace={getByName:(name:string)=>{performanceView:(sport:string,period:string)=>Promise<any>;performanceResponse:(sport:string,period:string,market:string|null,group:string|null)=>Promise<string>}};
export async function workerPerformanceView(sport:string,period:string){
 const binding=env.DASHBOARD_JOBS as Namespace|undefined;
 if(!binding||typeof binding.getByName!=='function')throw Error('Performance view storage unavailable');
 return binding.getByName('performance:'+sport).performanceView(sport,period);
}

export async function workerPerformanceResponse(sport:string,period:string,market:string|null,group:string|null){
 const binding=env.DASHBOARD_JOBS as Namespace|undefined;
 if(!binding||typeof binding.getByName!=='function')throw Error('Performance view storage unavailable');
 return binding.getByName('performance:'+sport).performanceResponse(sport,period,market,group);
}
