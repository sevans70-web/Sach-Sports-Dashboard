import {performanceBreakdowns,performanceRecordFreshness} from '@/lib/performance-breakdowns';
import {performanceResponseScope} from '@/lib/performance-response-scope';
import {recordedProjectionValue} from '@/lib/saved-projection';
import {predictionAccuracy,predictionProbability} from '@/lib/prediction-probability';
import {dashboardDay} from '@/lib/dashboard-contract';
import {savedHistorySummary,historyGroup} from '@/lib/saved-performance';
/** Original public response calculations, memoized only as derived copies. */
export function performancePublicResponse(data:any,sport:string,period:string,market:string|null=null,group:string|null=null,league:string|null=null,now=Date.now(),scoped?:any[]){
 const scopedRecords=scoped??performanceResponseScope(data.records,period,new Date(now),league);
  const selected=scopedRecords.filter(r=>(!market||r.market===market)&&(!group||historyGroup(r,sport)===group));
  const categories=Object.fromEntries([...new Set(scopedRecords.map(r=>String(r.market)))].map(key=>[key,savedHistorySummary(scopedRecords.filter(r=>r.market===key))]));
  return ({success:data.records.length>0||data.coverage.complete||data.cache!=null,connected:data.records.length>0||data.coverage.complete||data.cache!=null,partial:!data.coverage.complete,sport,period,league,readOnly:true,researchSummary:savedHistorySummary(selected),probabilityAccuracy:predictionAccuracy(selected.map(r=>({...r,sport}))),overallSummary:savedHistorySummary(scopedRecords),categories,coverage:data.coverage,
   featured:data.featured,cache:data.cache,breakdowns:performanceBreakdowns(selected),recordFreshness:performanceRecordFreshness(scopedRecords),
   // Preserve the saved call and grade. These are historical forecasts, not newly validated picks.
   records:selected.sort((a,b)=>String(b.gameTime||b.savedAt).localeCompare(String(a.gameTime||a.savedAt))).map(r=>({key:r.key,playerName:r.playerName,gameId:r.gameId,teamName:r.teamName,matchup:r.matchup,rank:r.rank,projectionBasis:r.projectionBasis,market:r.market,gameDate:Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):r.gameDate,storedGameDate:r.gameDate,gameTime:r.gameTime,savedAt:r.savedAt,pick:r.pickSide||r.prediction||r.pick||null,line:r.sportsbookLine??r.line??null,projection:recordedProjectionValue(r),actual:r.actual??null,status:r.status,gradedAt:r.gradedAt,legacyResult:r.legacyResult||null,reviewReason:r.reviewReason||null,recordSource:r.performanceSource||null,originalLocked:r.performanceSource==='immutable_cloudflare_model_receipt',modelValidatedForBetting:r.modelValidatedForBetting===true,probability:predictionProbability(r)})),
   updatedAt:data.snapshotAt||new Date(now).toISOString(),refreshing:data.refreshing===true});
}
