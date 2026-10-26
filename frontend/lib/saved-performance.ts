import {isOfficialFinal} from '@/lib/history-save-policy';
import {reconcilePerformanceRecords} from '@/lib/performance-reconciliation';
import {cachedOfficialResult} from '@/lib/official-result-cache';
import {savedResearchDecisions,observeSavedResearch} from '@/lib/saved-research-performance';
import {cloudConfigured,listCloudPerformanceDocuments} from '../scripts/history-cloud.mjs';

import {promises as fs} from 'node:fs';
import {setImmediate as yieldToRequests} from 'node:timers/promises';
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
// Bound parsed-source reuse across periods/categories. Source mtimes invalidate it;
// neither original files nor historical grades are rewritten by this cache.
const parsedSources=new Map<string,{stamp:string;bytes:number;data:any}>(),sourceReads=new Map<string,Promise<any>>();let parsedBytes=0;
async function sourceDocument(file:string){
 const stat=await fs.stat(file),stamp=[stat.size,stat.mtimeMs,stat.ctimeMs].join('|'),key=file+'|'+stamp;
 const cached=parsedSources.get(file);if(cached?.stamp===stamp)return cached.data;
 let work=sourceReads.get(key);
 if(!work){work=(async()=>{const data=JSON.parse(await fs.readFile(file,'utf8'));if(stat.size<=2*1024*1024){if(cached)parsedBytes-=cached.bytes;parsedSources.delete(file);while(parsedBytes+stat.size>16*1024*1024&&parsedSources.size){const first=parsedSources.keys().next().value!;parsedBytes-=parsedSources.get(first)!.bytes;parsedSources.delete(first);}parsedSources.set(file,{stamp,bytes:stat.size,data});parsedBytes+=stat.size;}return data;})().finally(()=>sourceReads.delete(key));sourceReads.set(key,work);}
 return work;
}
/** Original saved calls only. Provider reconciliation may run after the response. */
export async function readSavedPerformance(sport:string,period:string,now=new Date(),root=historyRoot(),options:{observe?:boolean;cloud?:boolean}={}){
 if(!(HISTORY_SPORTS as readonly string[]).includes(sport))throw new Error('Unsupported sport');
 const startedAt=Date.now();
 if(process.env.NODE_ENV==='production')console.info('[performance-start]',JSON.stringify({sport,period,observe:options.observe!==false,cloud:options.cloud!==false}));
 const remoteWork=cloudConfigured()?(options.cloud===false?Promise.resolve({rows:[] as any[],errors:['checking']}):listCloudPerformanceDocuments(sport).catch(()=>({rows:[] as any[],errors:['unavailable']}))):Promise.resolve({rows:[] as any[],errors:[] as string[]});
 const directory=path.join(root,sport,sport==='mlb'?'performance':'');
 const names=await fs.readdir(directory).catch((e)=>{if(e.code==='ENOENT'&&cloudConfigured())return [] as string[];throw e;});
 const days=historyDays(period,now),fileDays=historyDays('Season',now),rows:any[]=[],errors:string[]=[],observations=new Map<string,any>();let files=0;
 const availableDates=new Set<string>(),observationTimes=new Map<string,number>();
 const remember=(payload:any,observedAt?:string)=>{const key=String(payload.gameId),at=Date.parse(observedAt||payload.updatedAt||'')||0;if(!observations.has(key)||at>(observationTimes.get(key)||0)){observations.set(key,payload);observationTimes.set(key,at);}};
 const consume=(payload:any,stream:string,date:string)=>{
  if(stream.startsWith('protected_final_')){if(!Array.isArray(payload))throw Error('Invalid final receipt');for(const receipt of payload){const item=receipt?.payload;if(item?.kind==='official_final_checkpoint'&&item.source==='official_final_boxscore'&&isOfficialFinal(item.boxscore,String(item.gameId)))remember(item.boxscore,item.observedAt||receipt.savedAt);}return;}
  if(stream.startsWith('protected_pregame_')){if(!Array.isArray(payload))throw Error('Invalid pregame receipt');for(const receipt of payload){const item=receipt?.payload;if(item?.kind==='pregame_checkpoint')rows.push(...savedResearchDecisions([{...item,capturedAt:item.checkpointAt}]).map(r=>({...r,performanceSource:'checkpoint'})));}return;}
  if(stream.startsWith('official_final_')){const p=cachedOfficialResult(payload);if(!p)throw Error('Invalid official result cache');remember(p,payload.savedAt);return;}
  if(/^(slate_locked_|slate_board_|restored_slate_board_|locked_research_|featured_)/.test(stream)){
   rows.push(...savedResearchDecisions(Array.isArray(payload)?payload:[]).map(r=>({...r,performanceSource:/^(slate_locked_|locked_research_)/.test(stream)?'locked':'board'})));return;
  }
  if(sport==='mlb')rows.push(...mlbAdminSnapshot(payload,date));
  else {if(!Array.isArray(payload))throw Error('Invalid history array');rows.push(...payload.filter((r:any)=>r&&typeof r.market==='string'&&typeof r.status==='string'));}
 };
 const selected=[...names].filter(name=>{const date=name.match(/(?:^|_)(\d{4}-\d{2}-\d{2})\.json$/)?.[1];
  if(!date||/^(performance_view_|player_history_|featured_selections_|featured_results_)/.test(name)||(/^protected_/.test(name)&&!/^protected_(final_|pregame_)/.test(name)))return false;availableDates.add(date);return fileDays.has(date);
 }).sort((a,b)=>Number(!a.startsWith('slate_locked_'))-Number(!b.startsWith('slate_locked_')));
 if(process.env.NODE_ENV==='production')console.info('[performance-local]',JSON.stringify({sport,period,selectedFiles:selected.length}));
 for(let i=0;i<selected.length;i+=4){const batch=await Promise.all(selected.slice(i,i+4).map(async name=>{try{return {name,payload:await sourceDocument(path.join(directory,name))}}catch{return {name,error:true}}}));
  for(const item of batch){if(item.error){errors.push(item.name);continue;}try{const date=item.name.match(/(\d{4}-\d{2}-\d{2})\.json$/)![1],stream=item.name.replace(/_?\d{4}-\d{2}-\d{2}\.json$/,'')||'performance';consume(item.payload,stream,date);files++;}catch{errors.push(item.name);}}
  await yieldToRequests();
 }
 const localFinishedAt=Date.now(),remote=await remoteWork,cloudFinishedAt=Date.now();errors.push(...remote.errors.map((x:string)=>'cloud:'+x));
 for(const doc of remote.rows)try{consume(doc.payload,doc.stream,doc.game_date);}catch{errors.push('cloud:'+doc.stream+'|'+doc.game_date);}
 const reconciled=reconcilePerformanceRecords(rows);
 const records=await observeSavedResearch(reconciled.records.filter(r=>days.has(Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):String(r.gameDate||''))),sport,{root,observations,cachedOnly:options.observe===false});
 if(process.env.NODE_ENV==='production')console.info('[performance-read]',JSON.stringify({sport,period,observe:options.observe!==false,cloud:options.cloud!==false,files,records:records.length,localMs:localFinishedAt-startedAt,cloudWaitMs:cloudFinishedAt-localFinishedAt,reconcileMs:Date.now()-cloudFinishedAt,totalMs:Date.now()-startedAt}));
 return {records,coverage:{files,availableDates:[...new Set([...availableDates,...remote.rows.map(d=>d.game_date)])].sort(),cloudDocuments:remote.rows.length,errors,complete:errors.length===0,duplicatesReconciled:reconciled.duplicates,conflictingCopies:reconciled.conflicts},summary:savedHistorySummary(records)};
}
