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

/** Dated observations for research and future walk-forward evaluation. No zero
 * is discarded based on its outcome. Workload exclusions remain inspectable. */
export function footballResearchSample(payload:any,aliases:readonly (string|readonly string[])[],market:string,asOf:string,season:number){
 const norm=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
 const names=(payload?.names||[]).map(norm);
 const groups=Array.isArray(aliases[0])?aliases as readonly (readonly string[])[]:[aliases as readonly string[]];
 const indices=groups.map(group=>group.map(norm).map(alias=>names.indexOf(alias)).find(index=>index>=0)??-1);
 const passing=["passing_yards","passing_tds","pass_completions","passing_rushing_yards"].includes(market);
 const attempts=names.findIndex((name:string)=>["passingattempts","passattempts","attempts"].includes(name));
 const cutoff=Math.min(Date.parse(asOf),Date.now());
 const seen=new Set<string>();
 const observations:{eventId:string;date:string;value:number|null;workload:number|null;included:boolean;reason:string|null}[]=[];
 for(const st of payload?.seasonTypes||[])for(const category of st?.categories||[]){
  if(category?.type!=="event")continue;
  for(const event of category.events||[]){
   const eventId=String(event.eventId||"");if(!eventId||seen.has(eventId))continue;seen.add(eventId);
   const meta=payload?.events?.[eventId];
   const date=String(meta?.gameDate||meta?.date||event.gameDate||event.date||"");
   const time=Date.parse(date),stats=event.stats||[];
   const parts=indices.map(index=>index<0?null:statNumber(stats[index]));
   const value=parts.length&&parts.every((v):v is number=>v!=null)?(parts as number[]).reduce((a,b)=>a+b,0):null;
   const workload=attempts<0?null:statNumber(stats[attempts]);
   // Ten attempts is a transparent research cohort filter, NOT a starter model.
   // It never converts a zero into a missing result or certifies a future role.
   const reason=!Number.isFinite(time)?"undated":!Number.isFinite(cutoff)||time>=cutoff?"not_pregame":
    Number(date.slice(0,4))!==season?"previous_season":value==null?"missing_stat":
    passing&&workload==null?"missing_workload":passing&&workload!<10?"limited_passing_role":null;
   observations.push({eventId,date,value,workload,included:reason==null,reason});
  }
 }
 observations.sort((a,b)=>a.date.localeCompare(b.date));
 const included=observations.filter(x=>x.included).slice(-10);
 const weight=included.reduce((sum,_,i)=>sum+i+1,0);
 const projection=included.length>=3?Math.round(included.reduce((sum,x,i)=>sum+x.value!*(i+1),0)/weight*10)/10:null;
 return {projection,games:included.length,observations,excluded:observations.filter(x=>!x.included).length,
  methodology:"Current-season pregame research cohort; passing appearances require at least 10 attempts; minimum 3 games. Not a role forecast."};
}
