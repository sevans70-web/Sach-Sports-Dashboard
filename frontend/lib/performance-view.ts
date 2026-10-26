import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {dashboardDay} from '@/lib/dashboard-contract';
import {historyRoot} from '@/lib/durable-history';
import {readSavedPerformance} from '@/lib/saved-performance';
type SavedView=Awaited<ReturnType<typeof readSavedPerformance>>&{snapshotAt:string;refreshing?:boolean};
const pending=new Map<string,Promise<SavedView>>();
/** Derived result views keep source history untouched and survive application restarts. */
export async function performanceView(sport:string,period:string,defer:(work:()=>Promise<any>)=>void,now=Date.now(),root=historyRoot(),read=readSavedPerformance):Promise<SavedView>{
 if(!/^[a-z0-9_-]+$/i.test(sport)||!['Today','Yesterday','Week','Month','Season'].includes(period))throw Error('Invalid performance scope');
 const day=dashboardDay(new Date(now)),dir=path.join(root,sport),file=path.join(dir,'performance_view_'+period+'_'+day+'.json'),key=file;
 const refresh=()=>{let work=pending.get(key);if(!work){work=(async()=>{const data=await read(sport,period,new Date(now),root),at=new Date(now).toISOString();await fs.mkdir(dir,{recursive:true});const temp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(temp,JSON.stringify([{at,data}]));await fs.rename(temp,file);return {...data,snapshotAt:at};})().finally(()=>pending.delete(key));pending.set(key,work);}return work;};
 try{const [cached]=JSON.parse(await fs.readFile(file,'utf8'));const age=now-Date.parse(cached?.at||'');if(age>=0&&age<24*3600_000&&Array.isArray(cached?.data?.records)&&cached.data.coverage){if(age>=60_000)defer(()=>refresh().catch(e=>console.warn('[performance refresh]',sport,period,e instanceof Error?e.message:'failed')));return {...cached.data,snapshotAt:cached.at,refreshing:age>=60_000};}}catch{}
 return refresh();
}
