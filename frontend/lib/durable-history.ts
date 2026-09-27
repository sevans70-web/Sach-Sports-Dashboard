import {promises as fs} from "node:fs";
import path from "node:path";

const ROOT=process.env.SACH_HISTORY_DIR||"/data/sach-history";
function safe(v:string){return String(v||"").replace(/[^a-z0-9_-]/gi,"_")}
function file(sport:string,market:string,day:string){return path.join(ROOT,safe(sport),`${safe(market)}_${safe(day)}.json`)}
export function historyRoot(){return ROOT}
export async function readDurableHistory<T>(sport:string,market:string,day:string):Promise<T[]>{
 try{const raw=await fs.readFile(file(sport,market,day),"utf8");const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed as T[]:[]}catch{return []}
}
export async function writeDurableHistory<T>(sport:string,market:string,day:string,rows:T[]):Promise<boolean>{
 try{const target=file(sport,market,day);await fs.mkdir(path.dirname(target),{recursive:true});const temp=`${target}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(rows,null,2),"utf8");await fs.rename(temp,target);return true}catch(e){console.error("[durable-history] write failed",{sport,market,day,root:ROOT,error:e instanceof Error?e.message:String(e)});return false}
}
export async function durableHistoryStatus(){
 try{await fs.mkdir(ROOT,{recursive:true});const probe=path.join(ROOT,".write-test");await fs.writeFile(probe,new Date().toISOString(),"utf8");await fs.unlink(probe);return {ok:true,root:ROOT}}
 catch(e){return {ok:false,root:ROOT,error:e instanceof Error?e.message:String(e)}}
}

export type DurableSnapshot={capturedAt:string;hash:string;payload:unknown};
function stableHash(value:unknown){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(16)}
export async function appendDurableSnapshot(sport:string,stream:string,day:string,payload:unknown,maxRows=400):Promise<boolean>{
 try{
  const existing=await readDurableHistory<DurableSnapshot>(sport,`snapshots_${stream}`,day);
  const hash=stableHash(payload); if(existing.length&&existing[existing.length-1]?.hash===hash)return true;
  const next=[...existing,{capturedAt:new Date().toISOString(),hash,payload}].slice(-maxRows);
  return writeDurableHistory(sport,`snapshots_${stream}`,day,next);
 }catch(e){console.error("[durable-history] snapshot append failed",{sport,stream,day,error:e instanceof Error?e.message:String(e)});return false}
}
export function torontoHistoryDay(v:Date|string=new Date()){const d=typeof v==="string"?new Date(v):v;const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`}
