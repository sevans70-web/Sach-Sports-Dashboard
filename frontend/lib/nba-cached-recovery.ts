import {readPregameBoard} from '@/lib/ranking-board-cache';
import {selectNbaCandidates} from '@/lib/nba-ranking-candidates';
import {scopedNbaBoard} from '@/lib/nba-slate-scope';
/** Read-only, short-lived display recovery. Never reprice or refit stored picks. */
export async function recoverNbaCachedBoard(binding:unknown,market:string,day:string,now=Date.now(),options:{activeScope?:boolean;cacheFirst?:boolean}={}){
 // An explicit today/tomorrow request must not change the default active
 // slate during an overnight game. Only default-route responses seed this key.
 const cached=await readPregameBoard(binding,options.activeScope?'nba-active':'nba',market,day,now);
 if(!cached?.pregameOnly)return null;
 const lock=Date.parse(cached.board.boardLockAt||'');
 // Daily-board locking can precede the first player on a filtered board.
 // Let the application resolve frozen history at/after that boundary.
 if(options.cacheFirst&&(!Number.isFinite(lock)||cached.capturedAt>=lock||now>=lock))return null;
 const rows=selectNbaCandidates(cached.board.rows.filter((row:any)=>row.market===market),market,now);
 if(!rows.length)return null;
 return scopedNbaBoard({...cached.board,rows,dataState:'stale',refreshing:!options.cacheFirst,
  retainedAt:new Date(cached.capturedAt).toISOString(),
  observedAt:new Date(cached.capturedAt).toISOString(),
  coverageNotice:options.cacheFirst
   ?'Showing a recent verified pregame snapshot, not a new live quote. Original forecasts and sportsbook timestamps are preserved.'
   :'Live refresh is unavailable. Showing recent verified pregame rankings; original forecast and sportsbook timestamps are preserved.'},market,day,now);
}
