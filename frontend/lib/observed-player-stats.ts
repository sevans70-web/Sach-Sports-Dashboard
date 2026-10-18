import {nullableNumber} from "@/lib/provider-fetch";
import {basketballSummaryActual} from "@/lib/basketball-settlement";
import {basketballQ1Actual,basketballFirstBasketActual} from "@/lib/basketball-period-settlement";
export type ObservedPlayerRow={playerId:string;playerName:string;teamAbbr:string;stats:Record<string,number|null>};
const name=(value:any)=>typeof value==="object"?String(value?.default||""):String(value||"");
const n=nullableNumber;
export function nhlObservedRows(payload:any):ObservedPlayerRow[]{
 const out:ObservedPlayerRow[]=[];
 for(const side of ["away","home"]){
  const groups=payload?.playerByGameStats?.[`${side}Team`]??payload?.playerByGameStats?.[side]??{};
  for(const bucket of ["forwards","defense","goalies"])for(const row of groups[bucket]||[]){
   if(!row.playerId||row.didNotPlay===true||/^0{1,2}:00$/.test(String(row.toi??row.timeOnIce??"")))continue;
   const goals=n(row.goals),assists=n(row.assists),against=n(row.shotsAgainst),allowed=n(row.goalsAgainst);
   const pair=String(row.saveShotsAgainst??"").match(/^(\d+)\s*\/\s*(\d+)$/);
   const saves=n(row.saves)??(pair?Number(pair[1]):against!=null&&allowed!=null&&against>=allowed?against-allowed:null);
   out.push({playerId:String(row.playerId),playerName:name(row.name)||[name(row.firstName),name(row.lastName)].filter(Boolean).join(" "),teamAbbr:String(payload?.[`${side}Team`]?.abbrev||""),stats:{
    shots_on_goal:n(row.sog??row.shots),goals,assists,points:n(row.points)??(goals!=null&&assists!=null?goals+assists:null),blocked_shots:n(row.blockedShots??row.blocked??row.blocks),goalie_saves:bucket==="goalies"?saves:null,
   }});
  }
 }
 return out;
}
export function nhlObservedActual(payload:any,playerId:string|number,market:string){return nhlObservedRows(payload).find(row=>row.playerId===String(playerId))?.stats[market]??null}
export function basketballObservedRows(payload:any):ObservedPlayerRow[]{
 const players=new Map<string,{playerId:string;playerName:string;teamAbbr:string}>();
 for(const team of payload?.boxscore?.players||[])for(const group of team.statistics||[])for(const row of group.athletes||[]){
  const a=row.athlete||row.player||{},id=String(a.id||row.athleteId||row.playerId||"");
  if(!id||row.didNotPlay===true)continue;
  players.set(id,{playerId:id,playerName:String(a.displayName||a.fullName||a.name||""),teamAbbr:String(team.team?.abbreviation||"")});
 }
 const full=["points","rebounds","assists","threes_made","pts_rebs_asts","pts_rebs","pts_asts","rebs_asts","steals","blocks"];
 const quarter=["q1_points","q1_rebounds","q1_assists","q1_threes_made","q1_pts_rebs_asts"];
 return [...players.values()].map(p=>({...p,stats:Object.fromEntries([...full.map(m=>[m,basketballSummaryActual(payload,p,m)]),...quarter.map(m=>[m,basketballQ1Actual(payload,p,m)]),["first_basket",basketballFirstBasketActual(payload,p)]])}));
}
