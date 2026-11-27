import {performancePublicResponse} from '@/lib/performance-public-response';
import {readSavedPerformance,savedHistorySummary,historyDays} from '@/lib/saved-performance';
import {projectPerformanceDocument} from '@/lib/performance-document';
import {performanceRecordAccumulator} from '@/lib/performance-record-view';
import {appendMissingImmutableModelPicks} from '../scripts/worker-pregame-history.mjs';
import {dashboardDay} from '@/lib/dashboard-contract';
import {FEATURED_STREAMS,mergeFeaturedOriginals} from '@/lib/featured-originals';
import {compactPerformanceRecord} from '@/lib/performance-record-view';
import {readCloudDocumentRange} from '../scripts/history-cloud.mjs';
import {matchingFeaturedResult,featuredSelectionDispute} from '@/lib/featured-performance-match';
import {reportedFeaturedOriginal} from '@/lib/featured-history-corrections';
import {estimatedEv,estimatedEvText} from '@/lib/estimated-ev';

const keys=['play','value','first','long'];
export function cachedFeaturedPerformance(sport:string,period:string,boards:any[],history:any[],grades:any[],complete:boolean,now=Date.now()){
 const days=historyDays(period,new Date(now)),records:any[]=[];
 for(const {day,choices} of boards)if(days.has(day))for(const card of choices){
  if(!keys.includes(card.key)||!card.pick?.row)continue;
  const p=card.pick,row=p.row,correction=reportedFeaturedOriginal(sport,day,card.key);
  if(correction){records.push({key:card.key,day,playerName:correction.playerName,market:correction.market,side:correction.prediction,line:correction.sportsbookLine,odds:null,sportsbook:null,gameTime:correction.gameTime,selectedAt:null,status:'unverified',actual:correction.officialTouchdowns,verifiedResult:false,selectionSource:correction.selectionSource,selectionIssue:correction.note+' '+correction.resultNote,recordedLaterSelection:{playerName:row.playerName,odds:p.price??null},resultSource:'official_final_boxscore',officialGameId:correction.gameId});continue;}
  const selectionIssue=featuredSelectionDispute(sport,day,card.key),result=selectionIssue?null:matchingFeaturedResult(row,[...grades,...history]);
  records.push({estimatedEv:row.savedFeaturedEv??estimatedEv(row),estimatedEvText:row.savedFeaturedEvText??estimatedEvText(row),key:card.key,day,playerName:row.playerName,market:row.market,side:row.prediction||null,line:row.sportsbookLine??null,odds:p.price??null,sportsbook:row.sportsbook||null,gameTime:String(row.gameTime||''),selectedAt:row.featuredSavedAt||row.boardCapturedAt||row.capturedAt||null,selectionIssue,status:selectionIssue?'unverified':result?.status||'pending',actual:result?.actual??null,verifiedResult:!!result,resultSource:result?.resultSource||null});
 }
 const categories=Object.fromEntries(keys.map(key=>{const items=records.filter(r=>r.key===key&&!r.selectionIssue),hits=items.filter(r=>r.status==='hit').length,misses=items.filter(r=>r.status==='miss').length,pushes=items.filter(r=>r.status==='push').length;return[key,{total:items.length,hits,misses,pushes,pending:items.length-hits-misses-pushes-items.filter(r=>r.status==='void').length,hitRate:hits+misses?Math.round(hits/(hits+misses)*1000)/10:null}];}));
 return {success:true,sport,period,categories,records,historyComplete:complete,gradePolicy:'Only matching stored results are graded; recorded odds are hypothetical, not placed bets.'};
}
export const workerPerformanceServices={
 response:performancePublicResponse,
 day:(now:number)=>dashboardDay(new Date(now)),
 project:projectPerformanceDocument,
 async protected(sport:string,now:number){return readSavedPerformance(sport,'Season',new Date(now),undefined,{observe:false,storage:'cloud',protectedOnly:true});},
 async refresh(sport:string,now:number,cache:any,protectedView:any){
  const result=await readSavedPerformance(sport,'Season',new Date(now),undefined,{observe:false,storage:'cloud',sourceCache:cache,sourceBudget:{cloudRequests:48,driveRequests:24,budgetMs:8000},protectedHistory:{rows:protectedView.records,invalid:protectedView.coverage.protectedOriginals.invalid}});
  return result;
 },
 async featured(sport:string,now=Date.now()){
  const days=[...historyDays('Season',new Date(now))].sort(),documents:any[]=[],grades:any[]=[];let complete=true;
  for(const stream of [...FEATURED_STREAMS,'featured_results']){
   try{
    const rows=await readCloudDocumentRange(sport,stream,days[0],days.at(-1)!,{pageSize:20,project:(doc:any)=>{
     const payload=Array.isArray(doc.payload)?doc.payload:[];
     const compactChoice=(card:any)=>card?.pick?.row?{...card,pick:{price:card.pick.price,row:{...compactPerformanceRecord(card.pick.row),savedFeaturedEv:estimatedEv(card.pick.row),savedFeaturedEvText:estimatedEvText(card.pick.row)}}}:card;
     return {...doc,payload:stream==='featured_results'?payload.map(compactPerformanceRecord):payload.map((v:any)=>stream.startsWith('protected_')?{...v,payload:compactChoice(v.payload)}:compactChoice(v))};
    }});
    if(stream==='featured_results')grades.push(...rows.flatMap(d=>d.payload));else documents.push(...rows);
   }catch{complete=false;}
  }
  return {boards:[...new Set(documents.map(d=>d.game_date))].map(day=>({day,choices:mergeFeaturedOriginals(documents.filter(d=>d.game_date===day),day)})),grades,complete};
 },
 merge(previous:any,current:any,protectedView:any,now=Date.now()){
  const accumulator=performanceRecordAccumulator();accumulator.add(previous?.records||[]);accumulator.add(current?.records||[]);
  const days=historyDays('Season',new Date(now));
  const merged=appendMissingImmutableModelPicks(accumulator.result().records.filter((r:any)=>days.has(Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):r.gameDate)),protectedView.records);
  return {...current,records:merged.records,coverage:{...current.coverage,protectedOriginals:{added:merged.added,alreadyPresent:merged.alreadyPresent,invalid:protectedView.coverage.protectedOriginals.invalid}}};
 },
 scope(sport:string,period:string,view:any,featured:any,now:number){
  const days=historyDays(period,new Date(now)),records=view.records.filter((r:any)=>days.has(Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):r.gameDate));
  const coverage={...view.coverage},result={...view,records,coverage,summary:savedHistorySummary(records)};
  return {...result,featured:featured?cachedFeaturedPerformance(sport,period,featured.boards,records,featured.grades,coverage.complete&&featured.complete===true,now):{success:false,sport,period,categories:{},records:[],historyComplete:false,error:'Saved featured history is being restored; no totals have been assumed.'}};
 },
};
