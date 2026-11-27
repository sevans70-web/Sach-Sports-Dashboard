import {savedResearchDecisions} from '@/lib/saved-research-performance';
import {rawFinalPerformance} from '@/lib/raw-final-performance';
import {isOfficialFinal} from '@/lib/history-save-policy';
import {cachedOfficialResult} from '@/lib/official-result-cache';
import {mlbAdminSnapshot} from '@/lib/hidden-admin-history';
import {compactPerformanceRecord} from '@/lib/performance-record-view';
/** Shared parser: projections of authenticated saved documents only, never new forecasts. */
export function performanceDocumentConsumer(sport:string,addRows:(rows:any[])=>void,remember:(payload:any,at?:string)=>void){
 return (payload:any,stream:string,date:string,verifiedDocument=false)=>{
  if(stream==='performance_projection_v1'){if(payload?.version!==1||!Array.isArray(payload.records)||!Array.isArray(payload.observations))throw Error('Invalid derived performance source');addRows(payload.records);for(const item of payload.observations)remember(item,item.updatedAt);return;}
  if(stream.startsWith('archive_records_')){if(!Array.isArray(payload))throw Error('Invalid recovered archive');for(const row of payload){const item=row?.archiveFinal;if(item){if(['mlb','soccer'].includes(sport))item.boxscore=rawFinalPerformance(sport,String(item.gameId),item.boxscore,item.observedAt)||item.boxscore;if(item.kind==='official_final_checkpoint'&&item.source==='official_final_boxscore'&&isOfficialFinal(item.boxscore,String(item.gameId)))remember(item.boxscore,item.observedAt);}else addRows([row]);}return;}
  if(stream.startsWith('protected_final_')){if(!Array.isArray(payload))throw Error('Invalid final receipt');for(const receipt of payload){const item=receipt?.payload;if(item&&['mlb','soccer'].includes(sport))item.boxscore=rawFinalPerformance(sport,String(item.gameId),item.boxscore,item.observedAt)||item.boxscore;if(item?.kind==='official_final_checkpoint'&&item.source==='official_final_boxscore'&&isOfficialFinal(item.boxscore,String(item.gameId)))remember(item.boxscore,item.observedAt||receipt.savedAt);}return;}
  if(stream.startsWith('protected_pregame_')){if(!Array.isArray(payload))throw Error('Invalid pregame receipt');for(const receipt of payload){const item=receipt?.payload;if(item?.kind==='pregame_checkpoint')addRows(savedResearchDecisions([{...item,capturedAt:item.checkpointAt}]).map(r=>({...r,performanceSource:'checkpoint'})));}return;}
  if(stream.startsWith('official_final_')){const p=cachedOfficialResult(payload,verifiedDocument);if(!p)throw Error('Invalid official result cache');remember(p,payload.savedAt);return;}
  if(/^(slate_locked_|slate_board_|restored_slate_board_|locked_research_|featured_)/.test(stream)){
   addRows(savedResearchDecisions(Array.isArray(payload)?payload:[]).map(r=>({...r,performanceSource:/^(slate_locked_|locked_research_)/.test(stream)?'locked':'board'})));return;
  }
  if(sport==='mlb')addRows(mlbAdminSnapshot(payload,date));
  else {if(!Array.isArray(payload))throw Error('Invalid history array');addRows(payload.filter((r:any)=>r&&typeof r.market==='string'&&typeof r.status==='string'));}
 };
}
export function projectPerformanceDocument(sport:string,doc:any){
 const records:any[]=[],observations:any[]=[];
 performanceDocumentConsumer(sport,values=>records.push(...values.map(compactPerformanceRecord)),(p,at)=>observations.push({
  success:p.success,gameId:p.gameId,state:p.state,source:p.source,updatedAt:at||p.updatedAt,
  firstTouchdownVerified:p.firstTouchdownVerified,firstTouchdownScorerPlayerId:p.firstTouchdownScorerPlayerId,
  rows:Array.isArray(p.rows)?p.rows.map((r:any)=>({playerId:r.playerId,stats:r.stats})):[],
 }))(doc.payload,doc.stream,doc.game_date,true);
 return {stream:'performance_projection_v1',game_date:doc.game_date,payload:{version:1,records,observations}};
}
