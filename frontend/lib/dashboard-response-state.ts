import {dashboardDay} from '@/lib/dashboard-contract';
export const DASHBOARD_SNAPSHOT_MAX_AGE=15*60_000;
export function currentDashboardSnapshot(entry:{at:number;data:any}|undefined,now=Date.now()){
 return Boolean(entry&&Number.isFinite(entry.at)&&entry.at<=now&&now-entry.at<DASHBOARD_SNAPSHOT_MAX_AGE&&dashboardDay(new Date(entry.at))===dashboardDay(new Date(now)));
}
export function requireDashboardSummary(data:any){
 if(data?.success===false||data?.scheduleAvailable!==true||!Array.isArray(data?.previewGames)||!Number.isInteger(data.games)||data.games<0)throw Error('Schedule unavailable; counts cannot be verified');
 return data;
}
/** Confirmed empty schedules replace old games. Failed polls retain only a
 * bounded, same-date observed snapshot, labelled as retained. */
export function scheduleSnapshot(previous:{key:string;at:number;data:any}|null,key:string,data:any,ok:boolean,now=Date.now()){
 if(ok&&data?.success===true&&Array.isArray(data.games))return {key,at:now,data};
 if(previous?.key===key&&currentDashboardSnapshot(previous,now))return {...previous,data:{...previous.data,retainedSchedule:true,warning:'Schedule refresh unavailable; showing the last verified schedule',scheduleObservedAt:new Date(previous.at).toISOString()}};
 return null;
}
