import {readNbaSlateBoard} from '@/lib/nba-slate-board';
import {readDurableHistory,writeDurableHistory} from '@/lib/durable-history';
import {withHistoryLock} from '@/lib/history-lock';
import {savedModelPick} from '@/lib/saved-model-pick';
import {basketballSummaryActual} from '@/lib/basketball-settlement';

export function gradeSavedNbaPick(row:any,payload:any){
 if(String(payload?.header?.id)!==String(row.gameId)||payload?.header?.competitions?.[0]?.status?.type?.completed!==true)return {status:'pending',actual:null};
 const entries=(payload?.boxscore?.players||[]).flatMap((t:any)=>(t.statistics||[]).flatMap((g:any)=>g.athletes||[]));
 if(!entries.some((r:any)=>String(r.athlete?.id||r.player?.id)===String(row.playerId)))return {status:'pending',actual:null};
 if(entries.some((r:any)=>String(r.athlete?.id||r.player?.id)===String(row.playerId)&&r.didNotPlay===true))return {status:'void',actual:null,voidReason:'Official did not play'};
 const actual=basketballSummaryActual(payload,row,row.market);
 if(actual==null)return {status:'pending',actual:null};
 return {actual,status:actual===row.sportsbookLine?'push':(row.pickSide==='UNDER'?actual<row.sportsbookLine:actual>row.sportsbookLine)?'hit':'miss'};
}
export function summarizeSavedPicks(results:any[]){
 const count=(s:string)=>results.filter(r=>r.status===s).length;
 const hits=count('hit'),misses=count('miss'),pushes=count('push');
 return {scope:'saved_pregame_model_picks',connected:true,total:results.length,hits,misses,pushes,settled:hits+misses+pushes,pending:count('pending'),void:count('void'),hitRate:hits+misses?Math.round(1000*hits/(hits+misses))/10:null,results};
}
export async function nbaPickPerformance(markets:string[],days:string[],summary:(id:string)=>Promise<any>,now=Date.now()){
 const results:any[]=[];
 for(const day of days)for(const market of markets){
  const board=await readNbaSlateBoard(market,day);
  if(!board||Date.parse(board.lockAt)>now||!(Date.parse(board.capturedAt)<Date.parse(board.lockAt)))continue;
  const rows:any[]=[];
  const previous=await readDurableHistory<any>('nba','model_pick_results_'+market,day);
  for(const row of board.rows){
   if(row.market!==market)continue;
   const pick=savedModelPick(row,board.capturedAt);if(!pick)continue;
   const saved={...row,pickSide:pick.side,prediction:pick.side,sportsbookLine:pick.line,savedAt:board.capturedAt,boardCapturedAt:board.capturedAt,boardFrozen:true,validatedForBetting:false};
   const grade=gradeSavedNbaPick(saved,await summary(String(row.gameId)));
   const old=previous.find(r=>r.playerId===saved.playerId&&r.gameId===saved.gameId&&r.quoteId===saved.quoteId&&r.savedAt===saved.savedAt&&r.pickSide===saved.pickSide);
   rows.push({...saved,...(grade.status==='pending'&&old&&['hit','miss','push','void'].includes(old.status)?{status:old.status,actual:old.actual,voidReason:old.voidReason,gradedAt:old.gradedAt}:grade),...(grade.status!=='pending'?{gradedAt:new Date(now).toISOString(),gradeSource:'ESPN final boxscore'}:{})});
  }
  // Separate stream: original forecasts, grades and backups remain intact.
  if(rows.length)await withHistoryLock('nba-model-grades|'+market+'|'+day,()=>writeDurableHistory('nba','model_pick_results_'+market,day,rows));
  results.push(...rows);
 }
 return summarizeSavedPicks(results);
}
