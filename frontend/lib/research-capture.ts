import {appendHistorySnapshot} from "@/lib/history-archive";
import {withHistoryLock} from "@/lib/history-lock";
/** Observational research must keep accumulating for evaluation, but must not
 * enter wager history or be reported as a successfully validated betting pick.
 * Reuse the existing archive root/day/backup/retention policy unchanged. */
export async function archiveResearchBoards(sport:string,boards:any[]){
  const markets=await Promise.all(boards.map(async board=>{
    if(!board?.market||!Array.isArray(board.rows)||!board.rows.length||board.rows.some((r:any)=>r.integrityVersion!==1))return {market:board?.market,archived:false};
    try{
      const result=await withHistoryLock(`research-archive|${sport}|${board.market}`,()=>appendHistorySnapshot(sport,board.market,
        {kind:"research_rankings",integrityVersion:1,market:board.market,rows:board.rows,verifiedPredictions:0,updatedAt:board.updatedAt}));
      return {market:board.market,archived:result.ok};
    }catch(e){return {market:board.market,archived:false,error:e instanceof Error?e.message:String(e)}}
  }));
  return {researchArchived:markets.some(m=>m.archived),archivedMarkets:markets.filter(m=>m.archived).length,archiveErrors:markets.filter(m=>m.error)};
}
