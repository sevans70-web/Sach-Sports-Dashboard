import {savedResearchDecisions,observeSavedResearch} from '@/lib/saved-research-performance';
import {cloudConfigured,listCloudPerformanceDocuments} from '../scripts/history-cloud.mjs';

import {promises as fs} from 'node:fs';
import path from 'node:path';
import {historyRoot} from '@/lib/durable-history';
import {dashboardDay} from '@/lib/dashboard-contract';
import {mlbAdminSnapshot} from '@/lib/hidden-admin-history';

export const HISTORY_SPORTS=['nfl','cfb','nba','wnba','nhl','cbb','mlb','soccer'] as const;
export const HISTORY_PERIODS=['Today','Yesterday','Week','Month','Season'] as const;
export function historyDays(period:string,now=new Date()){
 const count=period==='Week'?7:period==='Month'?31:period==='Season'?370:1,offset=period==='Yesterday'?1:0;
 return new Set(Array.from({length:count},(_,i)=>dashboardDay(new Date(+now-(i+offset)*86400000))));
}
export function savedHistorySummary(rows:any[]){
 const active=rows.filter(r=>r.status!=='void'&&!r.withdrawnFromBoard);
 const hits=active.filter(r=>r.status==='hit').length,misses=active.filter(r=>r.status==='miss').length,pushes=active.filter(r=>r.status==='push').length;
 return {total:rows.length,hits,misses,pushes,completed:hits+misses+pushes,awaitingResult:active.filter(r=>r.status==='pending').length,void:rows.length-active.length,unknown:active.filter(r=>!['hit','miss','push','pending'].includes(r.status)).length,hitRate:hits+misses?Math.round(hits/(hits+misses)*1000)/10:null,
 lateRecords:rows.filter(r=>r.recoveredAfterStart||Number.isFinite(Date.parse(r.savedAt))&&Number.isFinite(Date.parse(r.gameTime))&&Date.parse(r.savedAt)>=Date.parse(r.gameTime)).length};
}
export function historyGroup(row:any,sport:string){
 if(sport==='mlb')return row.historySection||'batter';
 if(row.market?.startsWith('q1_'))return 'Q1';
 return /^(passing_|pass_completions|qb_)/.test(row.market||'')?'QB':'Offense';
}
/** Original saved calls only; research results may join exact official final observations. Never refit models or rewrite source history. */
export async function readSavedPerformance(sport:string,period:string,now=new Date(),root=historyRoot()){
 if(!(HISTORY_SPORTS as readonly string[]).includes(sport))throw new Error('Unsupported sport');
 const directory=path.join(root,sport,sport==='mlb'?'performance':'');
 const names=await fs.readdir(directory).catch((e)=>{if(e.code==='ENOENT'&&cloudConfigured())return [] as string[];throw e;}); // Propagate storage failure, never report it as zero history.
 const days=historyDays(period,now),fileDays=historyDays('Season',now),rows:any[]=[],errors:string[]=[];
 let files=0;
 const availableDates=new Set<string>();
 for(const name of [...names].sort((a,b)=>Number(!a.startsWith('slate_locked_'))-Number(!b.startsWith('slate_locked_')))){
  const date=name.match(/(?:^|_)(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
  if(!date||name.startsWith('protected_')||name.startsWith('performance_view_')||name.startsWith('player_history_')||name.startsWith('featured_selections_')||name.startsWith('featured_results_'))continue;availableDates.add(date);if(!fileDays.has(date))continue;
  try{
   const data=JSON.parse(await fs.readFile(path.join(directory,name),'utf8'));
   if(/^(slate_locked_|slate_board_|restored_slate_board_|locked_research_|featured_)/.test(name)){rows.push(...savedResearchDecisions(Array.isArray(data)?data:[]));files++;continue;}
   if(sport==='mlb')rows.push(...mlbAdminSnapshot(data,date));
   else {if(!Array.isArray(data))throw new Error('Invalid history array');rows.push(...data.filter((r:any)=>r&&typeof r.market==='string'&&typeof r.status==='string'));}
   files++;
  }catch{errors.push(name);}
 }
 let documents:any[]=[];
 if(cloudConfigured())try{const remote=await listCloudPerformanceDocuments(sport);documents=remote.rows;errors.push(...remote.errors.map((x:string)=>'cloud:'+x));}catch{errors.push('cloud:unavailable');}
 const cloudRows:any[]=[];
 for(const doc of documents){
  if(sport==='mlb'&&doc.stream==='performance')cloudRows.push(...mlbAdminSnapshot(doc.payload,doc.game_date));
  else if(Array.isArray(doc.payload)&&!doc.stream.startsWith('slate_board_')&&!doc.stream.startsWith('restored_slate_board_'))cloudRows.push(...doc.payload.filter((r:any)=>r&&typeof r.market==='string'&&typeof r.status==='string'));
 }
 const uniqueMap=new Map<string,any>();
 for(const r of [...cloudRows,...rows]){const key=r.gameId&&r.playerId?`${r.gameDate}|${r.market}|${r.gameId}|${r.playerId}`:r.key||`${r.gameDate}|${r.market}|${r.gameId}|${r.playerId}`,prior=uniqueMap.get(key);if(!prior||prior.historyBasis==='original_saved_research_forecast'&&r.historyBasis!=='original_saved_research_forecast')uniqueMap.set(key,r);}
 const unique=[...uniqueMap.values()];
 const records=await observeSavedResearch(unique.filter(r=>days.has(Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):String(r.gameDate||''))),sport);
 return {records,coverage:{files,availableDates:[...new Set([...availableDates,...documents.map(d=>d.game_date)])].sort(),cloudDocuments:documents.length,errors,complete:errors.length===0},summary:savedHistorySummary(records)};
}
