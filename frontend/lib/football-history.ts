import {statNumber} from "@/lib/provider-fetch";
/** ESPN lists game logs newest first in some responses. Return chronological observations. */
export function footballHistoryValues(payload:any,aliases:readonly string[]){
 const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const names=(Array.isArray(payload?.names)?payload.names:[]).map(norm);
 let index=-1;for(const alias of aliases){index=names.indexOf(norm(alias));if(index>=0)break}
 if(index<0)return [];
 const seen=new Set<string>(),rows:{date:string;value:number}[]=[];
 for(const season of payload?.seasonTypes||[])for(const category of season?.categories||[]){
  if(category?.type!=="event")continue;
  for(const event of category?.events||[]){
   const id=String(event?.eventId||"");if(!id||seen.has(id))continue;
   const value=statNumber(Array.isArray(event?.stats)?event.stats[index]:null);if(value==null)continue;
   const meta=payload?.events?.[id];const date=String(meta?.gameDate||meta?.date||event?.gameDate||event?.date||id);
   seen.add(id);rows.push({date,value});
  }
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date)).map(row=>row.value);
}
