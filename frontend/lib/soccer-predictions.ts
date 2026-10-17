import {promises as fs} from "node:fs";
import path from "node:path";
import {historyRoot,readDurableHistory,writeDurableHistory} from "@/lib/durable-history";
import {SOCCER_MARKETS,type SoccerMarketKey} from "@/lib/soccer";
import {soccerDay,soccerPick,mergeSoccerPicks,type SoccerPick} from "@/lib/soccer-settlement";
const stream=(league:string,market:string)=>`predictions_${league.replaceAll(".","_")}_${market}`;
const queues=new Map<string,Promise<unknown>>();
async function update(league:string,market:SoccerMarketKey,day:string,fn:(rows:SoccerPick[])=>SoccerPick[]){
 const key=`${league}|${market}|${day}`;
 const work=(queues.get(key)||Promise.resolve()).catch(()=>{}).then(async()=>{
  const before=await readDurableHistory<SoccerPick>("soccer",stream(league,market),day),after=fn(before);
  if(JSON.stringify(before)===JSON.stringify(after))return true;
  return writeDurableHistory("soccer",stream(league,market),day,after);
 });
 queues.set(key,work);
 try{return await work}finally{if(queues.get(key)===work)queues.delete(key)}
}
export async function captureSoccerPredictions(league:string,rankings:Record<string,any[]>,now=new Date()){
 let verifiedPredictions=0,writable=true;
 for(const [market]of SOCCER_MARKETS){
  const picks=(rankings[market]||[]).map(row=>soccerPick(league,market,row,now)).filter((p):p is SoccerPick=>Boolean(p));
  const days=[...new Set(picks.map(p=>p.gameDate))];
  for(const day of days){
   const rows=picks.filter(p=>p.gameDate===day);
   const ok=await update(league,market,day,existing=>mergeSoccerPicks(existing,rows,now));
   writable=writable&&ok;if(ok)verifiedPredictions+=rows.length;
  }
 }
 return {verifiedPredictions,writable};
}
export async function readSoccerPredictions(period:string,market?:SoccerMarketKey,league?:string){
 const now=new Date(),count=period==="Week"?7:period==="Month"?31:period==="Season"?370:1;
 const dates=new Set(Array.from({length:count},(_,i)=>soccerDay(new Date(now.getTime()-(i+(period==="Yesterday"?1:0))*86400000))));
 let names:string[]=[];
 try{names=await fs.readdir(path.join(historyRoot(),"soccer"))}catch(e){if((e as NodeJS.ErrnoException).code!=="ENOENT")throw e}
 const files=names.filter(name=>name.startsWith("predictions_")&&/_(\d{4}-\d{2}-\d{2})\.json$/.test(name)&&dates.has(name.match(/_(\d{4}-\d{2}-\d{2})\.json$/)![1]));
 const out:SoccerPick[]=[];
 for(let i=0;i<files.length;i+=32){
  const chunks=await Promise.all(files.slice(i,i+32).map(async name=>{
   const day=name.match(/_(\d{4}-\d{2}-\d{2})\.json$/)![1];
   return readDurableHistory<SoccerPick>("soccer",name.slice(0,-(day.length+6)),day);
  }));
  for(const rows of chunks)out.push(...rows.filter(p=>(!market||p.market===market)&&(!league||p.league===league)));
 }
 return [...new Map(out.map(p=>[p.key,p])).values()];
}
export async function saveSoccerGrades(rows:SoccerPick[]){
 const buckets=new Map<string,SoccerPick[]>();
 for(const row of rows){const k=`${row.league}|${row.market}|${row.gameDate}`;buckets.set(k,[...(buckets.get(k)||[]),row])}
 let writable=true;
 for(const group of buckets.values()){
  const first=group[0],updates=new Map(group.map(p=>[p.key,p]));
  writable=(await update(first.league,first.market,first.gameDate,existing=>existing.map(p=>p.status==="pending"&&updates.has(p.key)?{...p,...updates.get(p.key)!}:p)))&&writable;
 }
 return writable;
}
