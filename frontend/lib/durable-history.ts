import {readCloudDocumentsForDay} from '../scripts/history-cloud.mjs';
import {cloudHistoryRead,cloudHistoryWrite} from '@/lib/cloud-history';
import {promises as fs} from "node:fs";
import path from "node:path";

const ROOT=process.env.SACH_HISTORY_DIR||"/data/sach-history";
function safe(v:string){return String(v||"").replace(/[^a-z0-9_-]/gi,"_")}
function file(sport:string,market:string,day:string){return path.join(ROOT,safe(sport),`${safe(market)}_${safe(day)}.json`)}
export function historyRoot(){return ROOT}
export async function readDurableHistory<T>(sport:string,market:string,day:string):Promise<T[]>{
 try{const raw=await fs.readFile(file(sport,market,day),"utf8");const parsed=JSON.parse(raw);return Array.isArray(parsed)?parsed as T[]:[]}catch{const cloud=await cloudHistoryRead(sport,market,day);return Array.isArray(cloud)?cloud:[]}
}
export async function writeDurableHistory<T>(sport:string,market:string,day:string,rows:T[]):Promise<boolean>{
 let cloudOk=false;try{cloudOk=await cloudHistoryWrite(sport,market,day,rows);}catch(e){console.error("[cloud-history] write failed",{sport,market,day,error:e instanceof Error?e.message:String(e)});}
 try{const target=file(sport,market,day);await fs.mkdir(path.dirname(target),{recursive:true});const temp=`${target}.${process.pid}.tmp`;await fs.writeFile(temp,JSON.stringify(rows,null,2),"utf8");await fs.rename(temp,target);return true}catch(e){console.error("[durable-history] write failed",{sport,market,day,root:ROOT,error:e instanceof Error?e.message:String(e)});return cloudOk}
}
export async function durableHistoryStatus(){
 try{await fs.mkdir(ROOT,{recursive:true});const probe=path.join(ROOT,".write-test");await fs.writeFile(probe,new Date().toISOString(),"utf8");await fs.unlink(probe);return {ok:true,root:ROOT}}
 catch(e){return {ok:false,root:ROOT,error:e instanceof Error?e.message:String(e)}}
}

/** Prefer local current records, then fetch only missing streams for this day. */
export async function readDurableHistoryBatch(sport:string,streams:string[],day:string):Promise<any[]>{
 const local=await Promise.all(streams.map(async stream=>{
  try{const payload=JSON.parse(await fs.readFile(file(sport,stream,day),'utf8'));return Array.isArray(payload)?{stream,payload}:null;}catch{return null;}
 }));
 const found=local.filter(Boolean) as {stream:string;payload:any[]}[];
 const missing=streams.filter(stream=>!found.some(row=>row.stream===stream));
 const remote=await readCloudDocumentsForDay(sport,missing,day).catch(()=>[]);
 return [...found,...remote];
}
