import {captureFeaturedSelections} from '@/lib/featured-selection-capture';
import {writeDurableHistory} from '@/lib/durable-history';
import {dashboardDay} from '@/lib/dashboard-contract';
import {updateTopPlayMarket} from '@/lib/top-plays-store';
import {appendHistorySnapshot} from "@/lib/history-archive";
import {withHistoryLock} from "@/lib/history-lock";
/** Observational research must keep accumulating for evaluation, but must not
 * enter wager history or be reported as a successfully validated betting pick.
 * Reuse the existing archive root/day/backup/retention policy unchanged. */
export async function archiveResearchBoards(sport:string,boards:any[]){
  await publishFeaturedBoards(sport,boards);
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

/** Shared by ranking routes and the independent all-sport scheduler. */
export async function publishFeaturedBoards(sport:string,boards:any[]){
 await captureFeaturedSelections(sport,boards);
 for(const board of boards)updateTopPlayMarket(sport,board);
 await Promise.all(boards.filter(b=>b?.market&&Array.isArray(b.rows)).map(board=>writeDurableHistory(sport,'featured_'+board.market,dashboardDay(new Date()),[{...board,featuredCapturedAt:new Date().toISOString()}])));
}
export function featuredBoardsFromCapture(payload:any,stream:string){
 if(Array.isArray(payload?.rows))return [{...payload,market:payload.market||stream}];
 return [payload?.rankings,payload?.batter,payload?.pitcher].filter(Boolean).flatMap(group=>Object.entries(group).filter(([,rows])=>Array.isArray(rows)).map(([market,rows])=>({market,rows,updatedAt:payload.updatedAt})));
}
