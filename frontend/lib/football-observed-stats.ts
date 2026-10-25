import {nullableNumber} from "@/lib/provider-fetch";
import {espnParticipation} from "@/lib/player-participation";
import type {ObservedPlayerRow} from "@/lib/observed-player-stats";

const norm=(v:any)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const definitions:Record<string,Record<string,string[]>>={
 defensive:{sacks:["sacks","sack"],tackles:["solo","solotackles"],tackles_assists:["tot","total","totaltackles"]},
 passing:{passing_yards:["yds","yards","passingyards"],passing_tds:["td","touchdowns"],pass_completions:["cmp","completions","catt","cmpatt"],pass_attempts:["att","attempts","catt","cmpatt"]},
 rushing:{rushing_yards:["yds","yards","rushingyards","caryds"],rushing_tds:["td","touchdowns"],rush_attempts:["car","att","carries","caryds"]},
 receiving:{receiving_yards:["yds","yards","receivingyards"],receiving_tds:["td","touchdowns"],receptions:["rec","receptions"],targets:["tgts","targets"]},
};
function readStat(raw:any,label:string,market:string){
 if(label==='caryds'){const pair=String(raw??'').match(/^(\d+)\s*[-/]\s*(-?\d+)$/);return nullableNumber(pair?.[market==='rush_attempts'?1:2])}
 if(['catt','cmpatt'].includes(label)){const pair=String(raw??'').match(/^(\d+)\s*[/\-]\s*(\d+)$/);return nullableNumber(pair?.[market==='pass_attempts'?2:1])}
 return nullableNumber(raw);
}
/** Use official player rows. A missing row/stat stays unknown, never an invented zero. */
export function footballObservedRows(payload:any):ObservedPlayerRow[]{
 const out:ObservedPlayerRow[]=[];
 const participating=new Set(espnParticipation(payload,"nfl").filter(p=>p.participationConfirmed).map(p=>p.playerId));
 for(const team of payload?.boxscore?.players||[]){
  const players=new Map<string,ObservedPlayerRow>();
  for(const group of team.statistics||[]){
   const category=norm(group.name||group.displayName),definition=definitions[category];if(!definition)continue;
   const labels=(group.labels||group.keys||[]).map((v:any)=>norm(typeof v==='object'?v?.name||v?.abbreviation:v));
   for(const row of group.athletes||[]){
    const a=row.athlete||{},id=String(a.id||'');if(!id||row.didNotPlay===true)continue;
    const player=players.get(id)||{playerId:id,playerName:String(a.displayName||a.fullName||''),teamAbbr:String(team.team?.abbreviation||''),stats:{}};
    for(const [market,aliases] of Object.entries(definition)){
     const ix=labels.findIndex((label:string)=>aliases.includes(label));if(ix<0)continue;
     player.stats[market]=readStat(row.stats?.[ix],labels[ix],market);
    }
    players.set(id,player);
   }
  }
  for(const player of players.values()){
   const stats=player.stats;
   // A missing category entry can mean zero only when the entire additive
   // team table reconciles to its published total and this player appeared.
   // Incomplete/blank tables and unused roster players remain unknown.
   if(participating.has(player.playerId))for(const group of team.statistics||[]){
    const definition=definitions[norm(group.name||group.displayName)];if(!definition||!Array.isArray(group.athletes)||group.athletes.some((r:any)=>String(r.athlete?.id)===player.playerId))continue;
    const labels=(group.labels||group.keys||[]).map((v:any)=>norm(typeof v==='object'?v?.name||v?.abbreviation:v));
    for(const [market,aliases] of Object.entries(definition)){
     if(stats[market]!==undefined)continue;
     const ix=labels.findIndex((label:string)=>aliases.includes(label));if(ix<0)continue;
     const total=readStat(group.totals?.[ix],labels[ix],market),parts=group.athletes.filter((r:any)=>r.didNotPlay!==true).map((r:any)=>readStat(r.stats?.[ix],labels[ix],market));
     if(total!=null&&parts.every((v:any)=>v!=null)&&Math.abs(parts.reduce((a:number,b:number)=>a+b,0)-total)<.001)stats[market]=0;
    }
   }
   stats.qb_rushing_yards=stats.rushing_yards??null;
   // Own rushing/receiving TDs only. Passing touchdowns never count as a scorer TD.
   stats.anytime_td=stats.rushing_tds!=null&&stats.receiving_tds!=null?stats.rushing_tds+stats.receiving_tds:null;
   for(const [combined,parts] of Object.entries({passing_rushing_yards:['passing_yards','rushing_yards'],rushing_receiving_yards:['rushing_yards','receiving_yards']})){
    const values=parts.map(p=>stats[p]);
    stats[combined]=values.every(v=>v!=null)?values.reduce((a,b)=>a!+b!,0):null;
   }
   // Identity/appearance evidence is separate from whether a market has a number.
   if(participating.has(player.playerId)||Object.values(stats).some(v=>v!=null))out.push(player);
  }
 }
 return out;
}
