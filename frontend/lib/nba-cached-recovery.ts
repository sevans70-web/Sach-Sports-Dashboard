import {readPregameBoard} from '@/lib/ranking-board-cache';
import {selectNbaCandidates} from '@/lib/nba-ranking-candidates';
import {scopedNbaBoard} from '@/lib/nba-slate-scope';
/** Read-only, short-lived display recovery. Never reprice or refit stored picks. */
export async function recoverNbaCachedBoard(binding:unknown,market:string,day:string,now=Date.now()){
 const cached=await readPregameBoard(binding,'nba',market,day,now);
 if(!cached?.pregameOnly)return null;
 const rows=selectNbaCandidates(cached.board.rows,market,now);
 if(!rows.length)return null;
 return scopedNbaBoard({...cached.board,rows,dataState:'stale',refreshing:true,
  retainedAt:new Date(cached.capturedAt).toISOString(),
  observedAt:new Date(cached.capturedAt).toISOString(),
  coverageNotice:'Live refresh is unavailable. Showing recent verified pregame rankings; original forecast and sportsbook timestamps are preserved.'},market,day,now);
}
