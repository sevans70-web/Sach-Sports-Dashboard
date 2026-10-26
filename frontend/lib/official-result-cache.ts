import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {dashboardDay} from '@/lib/dashboard-contract';
import {retentionCutoff} from '../scripts/retention-policy.mjs';
const digest=(value:any)=>createHash('sha256').update(JSON.stringify(value)??'').digest('hex');
export function cachedOfficialResult(envelope:any){
 const p=envelope?.payload;
 return envelope?.version===1&&envelope.sha256===digest(p)&&p?.success===true&&p.gameId&&Array.isArray(p.rows)&&['post','final','off'].includes(String(p.state).toLowerCase())?p:null;
}
export async function saveOfficialResult(root:string,sport:string,gameId:string,gameTime:string,payload:any){
 if(!/^[a-z0-9_-]+$/i.test(sport)||!/^\d+$/.test(gameId)||String(payload?.gameId)!==gameId||!Number.isFinite(Date.parse(gameTime)))return;
 const day=dashboardDay(gameTime);
 if(day<retentionCutoff()||day>dashboardDay(new Date()))return;
 const envelope={version:1,savedAt:new Date().toISOString(),sha256:digest(payload),payload};
 if(!cachedOfficialResult(envelope))return;
 const dir=path.join(root,sport),file=path.join(dir,`official_final_${gameId}_${day}.json`),temp=file+'.'+randomUUID()+'.tmp';
 await fs.mkdir(dir,{recursive:true});await fs.writeFile(temp,JSON.stringify(envelope));await fs.rename(temp,file);
}
