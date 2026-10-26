import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {dashboardDay} from '@/lib/dashboard-contract';
import {historyRoot} from '@/lib/durable-history';
import {readSavedPerformance,savedHistorySummary} from '@/lib/saved-performance';
import {reconcilePerformanceRecords} from '@/lib/performance-reconciliation';
type SavedView=Awaited<ReturnType<typeof readSavedPerformance>>&{snapshotAt:string;refreshing?:boolean};
const pending=new Map<string,Promise<SavedView>>();
/** Saved records render before final-stat provider calls. Only derived views are
 * updated; original history and pregame evidence remain untouched. */
export async function performanceView(sport:string,period:string,defer:(work:()=>Promise<any>)=>void,now=Date.now(),root=historyRoot(),read=readSavedPerformance):Promise<SavedView>{
 if(!/^[a-z0-9_-]+$/i.test(sport)||!['Today','Yesterday','Week','Month','Season'].includes(period))throw Error('Invalid performance scope');
 const day=dashboardDay(new Date(now)),dir=path.join(root,sport),file=path.join(dir,'performance_view_'+period+'_'+day+'.json'),key=file;
 let previous:SavedView|null=null;
 const write=async(data:Awaited<ReturnType<typeof readSavedPerformance>>,refreshing=false)=>{
  if(previous&&!data.coverage.complete&&data.records.length<previous.records.length){const merged=reconcilePerformanceRecords([...previous.records,...data.records]);data={...data,records:merged.records,summary:savedHistorySummary(merged.records)};}
  const at=new Date().toISOString(),view={...data,snapshotAt:at,refreshing};await fs.mkdir(dir,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify([{at:new Date(now).toISOString(),data:view}]));await fs.rename(temp,file);previous=view;return view;
 };
 const refresh=(observe=true)=>{let work=pending.get(key);if(!work){work=read(sport,period,new Date(now),root,{observe,cloud:observe}).then(data=>write(data,!observe)).finally(()=>pending.delete(key));pending.set(key,work);}return work;};
 const background=()=>defer(()=>refresh(true).catch(e=>console.warn('[performance refresh]',sport,period,e instanceof Error?e.message:'failed')));
 try{const [cached]=JSON.parse(await fs.readFile(file,'utf8'));const age=now-Date.parse(cached?.at||'');if(age>=0&&age<24*3600_000&&Array.isArray(cached?.data?.records)&&cached.data.coverage){const cachedView:SavedView={...cached.data,snapshotAt:cached.at};previous=cachedView;const recovering=cached.data.refreshing===true||cached.data.coverage.errors?.includes('cloud:checking');const stale=age>=(recovering?5000:60000);if(stale)background();return {...cachedView,refreshing:stale||cached.data.refreshing===true};}}catch{}
 const initial=await refresh(false);background();return {...initial,refreshing:true};
}
