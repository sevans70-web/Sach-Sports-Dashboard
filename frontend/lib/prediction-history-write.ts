import {readDurableHistory,writeDurableHistory} from "@/lib/durable-history";
import {withHistoryLock} from "@/lib/history-lock";
import {correctedGrade} from "@/lib/grade-reconciliation";
type RecordRow={key:string;status:string;savedAt?:string;frozenAt?:string|null;gameTime?:string;actual?:number|null;gradedAt?:string|null;withdrawnFromBoard?:boolean};
export function mergePredictionHistory<T extends RecordRow>(existing:T[],incoming:T[]):T[]{
 const map=new Map(existing.map(p=>[p.key,p]));
 for(const next of incoming){
  if(!next?.key)continue;const old=map.get(next.key);
  if(!old){map.set(next.key,next);continue}
  const reactivated=old.withdrawnFromBoard&&next.withdrawnFromBoard===false&&next.status==="pending"&&next.gameTime&&Date.parse(next.gameTime)>Date.now();
  if(old.status!=="pending"&&!reactivated){const corrected=correctedGrade(old,next);if(corrected)map.set(next.key,corrected);continue}
  if(next.status!=="pending"){
   map.set(next.key,{...old,status:next.status,actual:next.actual,gradedAt:next.gradedAt,withdrawnFromBoard:next.withdrawnFromBoard});continue;
  }
  if(old.frozenAt&&!reactivated)continue;
  map.set(next.key,Date.parse(next.savedAt||"")>=Date.parse(old.savedAt||"")||reactivated?next:old);
 }
 return [...map.values()];
}
export async function writePredictionHistory<T extends RecordRow>(sport:string,market:string,day:string,rows:T[],remember:(rows:T[])=>void){
 return withHistoryLock(`${sport}|${market}|${day}`,async()=>{
  const existing=await readDurableHistory<T>(sport,market,day),merged=mergePredictionHistory(existing,rows);
  const ok=await writeDurableHistory(sport,market,day,merged);if(ok)remember(merged);return ok;
 });
}
