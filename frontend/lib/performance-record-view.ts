import {dashboardDay} from '@/lib/dashboard-contract';
import {reconcilePerformanceRecords} from '@/lib/performance-reconciliation';

/** A derived results view must not retain every large ranking/model diagnostic
 * attached to every copy of a saved call. Original source records stay intact. */
export function compactPerformanceRecord(row:any){
 const fields=['key','sport','market','gameId','playerId','playerName','teamName','matchup','rank','historySection','gameDate','gameTime',
  'savedAt','boardCapturedAt','capturedAt','forecastCapturedAt','featuredSavedAt','projectionBasis','projection','modelProjection',
  'pickSide','prediction','pick','sportsbookLine','line','status','actual','gradedAt','legacyResult','reviewReason','resultSource','verifiedResult',
  'withdrawnFromBoard','recoveredAfterStart','performanceSource','historyBasis','originalSelectionChecksum','modelValidatedForBetting',
  'quoteVersion','quoteVerified','marketBacked','quoteId','sportsbookKey','sportsbook','quoteUpdatedAt','overPrice','underPrice','lineType',
  'boardFrozen','frozen','lockedAtKickoff','gameState','league','leagueSlug'];
 const out:any=Object.fromEntries(fields.filter(key=>Object.hasOwn(row,key)).map(key=>[key,row[key]]));
 const f=row.researchForecast;
 if(f&&typeof f==='object'){
  const keys=['status','projection','calculatedAt','giReason','selectionReason','modelSelection','priceComparison','modelTargetForecast','quoteEvidence'];
  out.researchForecast=Object.fromEntries(keys.filter(key=>Object.hasOwn(f,key)).map(key=>[key,f[key]]));
 }
 return out;
}

export function performanceRecordAccumulator(){
 const records=new Map<string,any>();let duplicates=0,conflicts=0;
 return {
  add(input:any[]){for(const value of input){
   const row=compactPerformanceRecord(value);
   const day=Number.isFinite(Date.parse(row.gameTime))?dashboardDay(row.gameTime):String(row.gameDate||'');
   const key=row.gameId&&row.playerId?[day,row.historySection||'',row.market,row.gameId,row.playerId].join('|'):row.key||[day,row.market,row.gameId,row.playerId].join('|');
   const prior=records.get(key);
   if(!prior){records.set(key,{...row,key});continue;}
   const merged=reconcilePerformanceRecords([prior,row]);
   duplicates+=merged.duplicates;conflicts+=merged.conflicts;records.set(key,merged.records[0]);
  }},
  result(){return {records:[...records.values()],duplicates,conflicts};},
 };
}
