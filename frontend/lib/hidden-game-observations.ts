import {basketballSummaryActual} from '@/lib/basketball-settlement';
import {playerGameObservations} from '@/lib/player-game-observations';
const finite=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
export function hiddenGameObservations(sport:'wnba'|'mlb',id:string,schedule:any,box:any){
 const rows:any[]=[];
 if(sport==='wnba'){
  if(String(box.header?.id)!==id)return [];
  const date=box.header?.competitions?.[0]?.date||schedule.date;
  for(const team of box.boxscore?.players||[])for(const group of team.statistics||[])for(const r of group.athletes||[]){
   if(r.didNotPlay===true)continue;const playerId=String(r.athlete?.id||'');if(!playerId)continue;
   const competitors=box.header?.competitions?.[0]?.competitors||[],opponent=competitors.find((c:any)=>String(c.team?.id)!==String(team.team?.id))?.team?.displayName||'';
   for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts','rebs_asts','steals','blocks']){
    const value=basketballSummaryActual(box,{playerId},market);if(value==null)continue;
    rows.push(...playerGameObservations(sport,playerId,market,[{gameId:id,date,opponent,value,source:'ESPN official final boxscore'}]));
   }
  }
 }else{
  const date=schedule.gameDate;
  for(const side of ['away','home'])for(const row of Object.values(box.teams?.[side]?.players||{}) as any[]){
   const playerId=String(row.person?.id||'');if(!playerId)continue;const opponent=box.teams?.[side==='home'?'away':'home']?.team?.name||'';
   const batting=row.stats?.batting||{},pitching=row.stats?.pitching||{};
   const stats:Record<string,any>={home_runs:batting.homeRuns,hits:batting.hits,total_bases:batting.totalBases,runs:batting.runs,rbis:batting.rbi,walks:batting.baseOnBalls,stolen_bases:batting.stolenBases,batter_strikeouts:batting.strikeOuts,strikeouts:pitching.strikeOuts,hits_allowed:pitching.hits,walks_allowed:pitching.baseOnBalls,earned_runs:pitching.earnedRuns};
   if(['hits','runs','rbi'].every(k=>finite(batting[k])!=null))stats.hits_runs_rbis=Number(batting.hits)+Number(batting.runs)+Number(batting.rbi);
   const innings=String(pitching.inningsPitched??'').match(/^(\d+)(?:\.([012]))?$/);stats.outs_recorded=pitching.outs??(innings?Number(innings[1])*3+Number(innings[2]||0):null);
   for(const [market,raw] of Object.entries(stats)){const value=finite(raw);if(value==null)continue;rows.push(...playerGameObservations(sport,playerId,market,[{gameId:id,date,opponent,value,source:'MLB official final boxscore'}]));}
  }
 }
 return [...new Map(rows.map(r=>[r.sport+'|'+r.player_id+'|'+r.game_id+'|'+r.market,r])).values()];
}
