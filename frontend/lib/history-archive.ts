import {promises as fs} from "node:fs";
import path from "node:path";
import {createHash} from "node:crypto";

const ROOT=process.env.SACH_HISTORY_DIR||"/data/sach-history";
const safe=(v:string)=>String(v||"").replace(/[^a-z0-9_-]/gi,"_");
export function torontoHistoryDay(v:Date|string=new Date()){
 const d=typeof v==="string"?new Date(v):v;if(Number.isNaN(d.getTime()))return "";
 const p=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const g=(t:string)=>p.find(x=>x.type===t)?.value||"";return `${g("year")}-${g("month")}-${g("day")}`;
}
type Snapshot={capturedAt:string;hash:string;payload:any};
function target(sport:string,stream:string,day:string){return path.join(ROOT,safe(sport),"archive",`${safe(stream)}_${safe(day)}.json`)}
export async function appendHistorySnapshot(sport:string,stream:string,payload:any,day=torontoHistoryDay()){
 const file=target(sport,stream,day);await fs.mkdir(path.dirname(file),{recursive:true});
 let rows:Snapshot[]=[];try{const parsed=JSON.parse(await fs.readFile(file,"utf8"));if(Array.isArray(parsed))rows=parsed}catch{}
 const raw=JSON.stringify(payload??null),hash=createHash("sha1").update(raw).digest("hex");
 if(rows.at(-1)?.hash===hash)return {ok:true,written:false,file,count:rows.length};
 rows.push({capturedAt:new Date().toISOString(),hash,payload});
 // Keep the full day while preventing an accidental runaway file.
 if(rows.length>1000)rows=rows.slice(-1000);
 const tmp=`${file}.${process.pid}.tmp`;await fs.writeFile(tmp,JSON.stringify(rows,null,2),"utf8");await fs.rename(tmp,file);
 return {ok:true,written:true,file,count:rows.length};
}
export async function historyArchiveStatus(){try{await fs.mkdir(ROOT,{recursive:true});await fs.access(ROOT,fs.constants.W_OK);return{ok:true,root:ROOT}}catch(e){return{ok:false,root:ROOT,error:e instanceof Error?e.message:String(e)}}}
