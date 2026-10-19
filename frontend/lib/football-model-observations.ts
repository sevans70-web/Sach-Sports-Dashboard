import {footballObservedRows} from '@/lib/football-observed-stats';
import type {OpportunityGame} from '@/lib/opportunity-backtest';

/** Population comes from completed official games, not today's ranking board
 * or roster. Historical membership and low-volume relief appearances remain. */
export function footballModelObservations(payload:any,identity:{sport:'nfl'|'cfb';season:string;gameId:string;source:string;retrievedAt:string}):OpportunityGame[]{
 const header=payload?.header,competition=header?.competitions?.[0];
 if(String(header?.id||'')!==identity.gameId||competition?.status?.type?.completed!==true)return [];
 if(String(header?.season?.year||'')!==identity.season||Number(header?.season?.type)!==2)return [];
 const time=Date.parse(competition.date||header.date||'');
 if(!Number.isFinite(time)||time>=Date.parse(identity.retrievedAt)-48*3600000)return [];
 const teams=(competition.competitors||[]).map((c:any)=>({id:String(c.team?.id||''),abbr:String(c.team?.abbreviation||'')}));
 if(teams.length!==2||teams.some((t:any)=>!t.id||!t.abbr)||teams[0].abbr===teams[1].abbr)return [];
 const volumes:Record<string,string>={passing_yards:'pass_attempts',rushing_yards:'rush_attempts',receiving_yards:'targets',receptions:'targets'};
 return footballObservedRows(payload).flatMap(row=>{
  const team=teams.find((t:any)=>t.abbr===row.teamAbbr),opponent=teams.find((t:any)=>t!==team);if(!team||!opponent)return [];
  return Object.entries(volumes).flatMap(([market,volume])=>{
   const actual=row.stats[market],workload=row.stats[volume];
   if(actual==null||workload==null||!Number.isFinite(actual)||!Number.isFinite(workload)||workload<=0)return [];
   return [{...identity,gameTime:new Date(time).toISOString(),playerId:row.playerId,playerName:row.playerName,teamId:team.id,opponentId:opponent.id,market,actual,workload}];
  });
 });
}
