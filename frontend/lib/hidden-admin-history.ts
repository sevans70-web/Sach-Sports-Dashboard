import {promises as fs} from 'node:fs';
import path from 'node:path';
import {historyRoot} from '@/lib/durable-history';
import {dashboardDay} from '@/lib/dashboard-contract';

/** Inspect saved MLB snapshots only. Never reconstruct calls or run settlement. */
export function mlbAdminSnapshot(payload:any,day:string){
 const rows:any[]=[];
 for(const section of ['batter','pitcher','emerging']){
  const history=payload?.[section],entries:any[]=history?.days&&typeof history.days==='object'?Object.entries(history.days):[[day,history]];
  for(const [savedDay,snapshot] of entries){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(savedDay))continue;
  for(const [market,records] of Object.entries(snapshot?.categories||{})){
   if(!Array.isArray(records))continue;
   for(const row of records)rows.push({...row,
    key:String(row.key||`${savedDay}|${section}|${market}|${row.gameId||row.game_pk||row.gamePk||''}|${row.playerId||row.player_id||row.pitcher_id||row.name||row.pitcher_name||''}`),
    gameDate:savedDay,market,historySection:section,playerId:String(row.playerId||row.player_id||row.pitcher_id||''),
    playerName:row.playerName||row.player_name||row.pitcher_name||row.name||'Unknown player',
    teamName:row.teamName||row.team_name||row.team||'',
    matchup:row.matchup||[row.team_name,row.opponent_name].filter(Boolean).join(' vs '),
    modelProjection:row.modelProjection??row.projection??null,giScore:row.giScore??row.gi_score??null,
    modelProbability:row.modelProbability??null,
    actual:typeof row.actual==='number'?row.actual:typeof row['actual_'+(market==='home_runs_pool'?'home_runs':market)]==='number'?row['actual_'+(market==='home_runs_pool'?'home_runs':market)]:null,
    reviewReason:'Legacy snapshot: original sportsbook selection, price provenance, participation and pregame timing are not verified.',
    gameId:String(row.gameId||row.game_pk||row.gamePk||''),
    savedAt:row.savedAt||row.first_seen_at||row.captured_at||snapshot.captured_at||null,
    capturedAt:row.captured_at||snapshot.captured_at||null,
    // Legacy target-hit labels are not proof of a saved sportsbook prediction.
    status:row.status||'unknown',legacyResult:row.result_label||null,
   });
  }
  }
 }
 return rows;
}
/** The original Streamlit history is bundled with the existing repository.
 * Read it in place; preserve legacy outcomes without inventing sportsbook calls. */
export async function readBundledMlbHistory(days:Set<string>,directory=path.join(process.cwd(),'data')){
 const rows:any[]=[],dates=new Set<string>(),errors:string[]=[];
 for(const [section,name] of [['batter','mlb_performance_history.json'],['pitcher','mlb_pitcher_performance_history.json']]){
  try{const history=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));if(!history.days||typeof history.days!=='object')throw Error('Invalid bundled history');
   for(const [day,value] of Object.entries(history.days))if(days.has(day)){rows.push(...mlbAdminSnapshot({[section]:value},day));dates.add(day);}
  }catch{errors.push('legacy:'+name);}
 }
 return {rows,dates:[...dates].sort(),errors};
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
