import {promises as fs} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {cloudHistoryWrite} from '@/lib/cloud-history';
import {withHistoryLock} from '@/lib/history-lock';
import {historyRoot} from '@/lib/durable-history';
const safe=(v:string)=>v.replace(/[^a-z0-9_-]/gi,'_');
/** An immutable local receipt plus a persistent replication queue. Cloud success
 * includes the existing checksum read-back; failure never discards the receipt. */
export async function protectHistory(sport:string,stream:string,day:string,payload:any,root=historyRoot()){
 return withHistoryLock(`protected|${sport}|${stream}|${day}`,async()=>{
  const dir=path.join(root,safe(sport)),name=`protected_${safe(stream)}_${safe(day)}.json`,target=path.join(dir,name);
  await fs.mkdir(dir,{recursive:true});
  try{return JSON.parse(await fs.readFile(target,'utf8'));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}
  const receipt=[{savedAt:new Date().toISOString(),payload}],temp=target+'.'+randomUUID()+'.tmp';
  // Queue first: a restart between these writes can only cause an extra retry.
  const queue=path.join(root,'_system','protected-outbox');await fs.mkdir(queue,{recursive:true});
  const job=path.join(queue,safe(sport)+'__'+name);
  await fs.writeFile(job,JSON.stringify({sport,stream:'protected_'+safe(stream),day,target}));
  await fs.writeFile(temp,JSON.stringify(receipt));await fs.rename(temp,target);return receipt;
 });
}
const replicating=new Set<string>();
export async function replicateProtectedHistory(sport:string,root=historyRoot(),limit=8,writer=cloudHistoryWrite){
 if(replicating.has(sport)||replicating.size>=2)return {busy:true,verified:0,pending:0,errors:[] as string[]};
 replicating.add(sport);
 let verified=0;const errors:string[]=[];const dir=path.join(root,'_system','protected-outbox');
 try{
  const names=(await fs.readdir(dir).catch(()=>[])).filter(n=>n.startsWith(safe(sport)+'__')).sort();
  for(const name of names.slice(0,limit))try{
   const file=path.join(dir,name),job=JSON.parse(await fs.readFile(file,'utf8')),rows=JSON.parse(await fs.readFile(job.target,'utf8'));
   if(await writer(job.sport,job.stream,job.day,rows)){await fs.unlink(file);verified++;}
   else errors.push(name+': cloud replication is not configured');
  }catch(e){errors.push(name+': '+(e instanceof Error?e.message:String(e)));}
  return {verified,pending:names.length-verified,errors};
 }finally{replicating.delete(sport);}
}
