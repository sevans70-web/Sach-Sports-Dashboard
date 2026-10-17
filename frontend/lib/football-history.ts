import {statNumber} from "@/lib/provider-fetch";
/** ESPN lists game logs newest first in some responses. Return chronological observations. */
export function footballHistoryValues(payload:any,aliases:readonly (string|readonly string[])[]){
 const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const names=(Array.isArray(payload?.names)?payload.names:[]).map(norm);
 const groups=Array.isArray(aliases[0])?aliases as readonly (readonly string[])[]:[aliases as readonly string[]];
 const indices=groups.map(group=>{for(const alias of group){const index=names.indexOf(norm(alias));if(index>=0)return index}return -1}).filter(index=>index>=0);
 if(!indices.length)return [];
 const seen=new Set<string>(),rows:{date:string;value:number}[]=[];
 for(const season of payload?.seasonTypes||[])for(const category of season?.categories||[]){
  if(category?.type!=="event")continue;
  for(const event of category?.events||[]){
   const id=String(event?.eventId||"");if(!id||seen.has(id))continue;
   const parts=indices.map(index=>statNumber(Array.isArray(event?.stats)?event.stats[index]:null)).filter((value):value is number=>value!=null);
   if(!parts.length)continue;const value=parts.reduce((sum,n)=>sum+n,0);
   const meta=payload?.events?.[id];const date=String(meta?.gameDate||meta?.date||event?.gameDate||event?.date||id);
   seen.add(id);rows.push({date,value});
  }
 }
 return rows.sort((a,b)=>a.date.localeCompare(b.date)).map(row=>row.value);
}

/** Category is part of a football statistic: passing YDS must never grade rushing YDS. */
export function footballSummaryStat(payload:any,market:string,playerId:string,playerName:string){
 const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const categories:Record<string,string[]>={passing_yards:["pass"],pass_completions:["pass"],rushing_yards:["rush"],receiving_yards:["receiv"],receptions:["receiv"],anytime_td:["rush","receiv"]};
 const labels:Record<string,string[]>={passing_yards:["yds","yards","passingyards"],pass_completions:["cmp","comp","completions","catt","cmpatt","completionsattempts"],rushing_yards:["yds","yards","rushingyards","caryds"],receiving_yards:["yds","yards","receivingyards"],receptions:["rec","receptions"],anytime_td:["td","touchdowns","rushingtouchdowns","receivingtouchdowns"]};
 let total=0,found=false;
 for(const team of payload?.boxscore?.players||[])for(const group of team?.statistics||[]){
  const category=norm(group.name||group.displayName||group.type);
  if(!(categories[market]||[]).some(alias=>category.includes(alias)))continue;
  const keys=(group.labels||group.keys||[]).map((key:any)=>norm(typeof key==="string"?key:key?.name||key?.abbreviation));
  const index=keys.findIndex((key:string)=>(labels[market]||[]).includes(key));if(index<0)continue;
  for(const row of group.athletes||[]){
   const athlete=row.athlete||{},id=String(athlete.id||"");
   if(playerId&&id?String(playerId)!==id:norm(athlete.displayName||athlete.fullName)!==norm(playerName))continue;
   let raw=row.stats?.[index];
   if(market==="pass_completions"&&["catt","cmpatt","completionsattempts"].includes(keys[index]))raw=String(raw??"").split(/[/-]/)[0];
   if(market==="rushing_yards"&&keys[index]==="caryds")raw=String(raw??"").match(/^\d+\s*[-/]\s*(-?\d+)$/)?.[1];
   const value=statNumber(raw);if(value==null)continue;
   if(market!=="anytime_td")return value;
   total+=value;found=true;
  }
 }
 return found?total:null;
}
