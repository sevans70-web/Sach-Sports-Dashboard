import {promises as fs} from 'node:fs';
import path from 'node:path';
import {historyRoot} from '@/lib/durable-history';
import {dashboardDay} from '@/lib/dashboard-contract';

/** Inspect saved MLB snapshots only. Never reconstruct calls or run settlement. */
export function mlbAdminSnapshot(payload:any,day:string){
 const rows:any[]=[];
 for(const section of ['batter','pitcher','emerging']){
  for(const [market,records] of Object.entries(payload?.[section]?.categories||{})){
   if(!Array.isArray(records))continue;
   for(const row of records)rows.push({...row,
    key:String(row.key||`${day}|${section}|${market}|${row.gameId||row.game_pk||row.gamePk||''}|${row.playerId||row.player_id||row.name||''}`),
    gameDate:day,market,playerId:String(row.playerId||row.player_id||''),
    playerName:row.playerName||row.player_name||row.name||'Unknown player',
    teamName:row.teamName||row.team||'',gameId:String(row.gameId||row.game_pk||row.gamePk||''),
    savedAt:row.savedAt||row.captured_at||payload[section].captured_at||null,
    // Legacy target-hit labels are not proof of a saved sportsbook prediction.
    status:row.status||'unknown',legacyResult:row.result_label||null,
   });
  }
 }
 return rows;
}
export async function readMlbAdminHistory(period:string){
 const dir=path.join(historyRoot(),'mlb','performance');
 const names=await fs.readdir(dir); // Missing/unreadable storage is not a verified empty result.
 const dates=new Set(Array.from({length:period==='Week'?7:1},(_,i)=>dashboardDay(new Date(Date.now()-(i+(period==='Yesterday'?1:0))*86400000))));
 const rows:any[]=[];
 for(const name of names.filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)&&dates.has(n.slice(0,10)))){
  const data=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
  rows.push(...mlbAdminSnapshot(data,name.slice(0,10)));
 }
 return [...new Map(rows.map(row=>[row.key,row])).values()];
}
export async function assertHiddenHistoryReadable(sport:'mlb'|'soccer'){
 await fs.readdir(path.join(historyRoot(),sport));
}
