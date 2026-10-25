import {readDurableHistory,writeDurableHistory} from '@/lib/durable-history';
import {visitHistorySnapshots,torontoHistoryDay} from '@/lib/history-archive';
import {withHistoryLock} from '@/lib/history-lock';

/** Recover the complete research board, including rows withheld from betting history.
 * Never reconstruct a pregame projection or selection from live statistics. */
export function selectNflLockedBoard(snapshots:any[],market:string,day:string,now=Date.now()){
 let best:any=null;
 for(const s of snapshots){
  const at=Date.parse(s.capturedAt),p=s.payload;
  if(!Number.isFinite(at)||at>now||p?.kind!=='research_rankings'||p.market!==market)continue;
  const rows=(p.rows||[]).filter((r:any)=>torontoHistoryDay(r.gameTime)===day&&at<Date.parse(r.gameTime));
  if(!rows.length)continue;
  // A smaller post-kickoff feed must never replace the full recorded slate.
  if(!best||rows.length>best.rows.length||rows.length===best.rows.length&&at>Date.parse(best.capturedAt))best={capturedAt:s.capturedAt,rows:rows.slice(0,25)};
 }
 return best;
}
const pending=new Map<string,Promise<any>>();
export async function lockedNflBoard(market:string,games:any[],now=Date.now()){
 const day=torontoHistoryDay(new Date(now)),today=games.filter(g=>torontoHistoryDay(g.date)===day);
 if(!today.some(g=>Date.parse(g.date)<=now))return null;
 const key=market+'|'+day;
 if(pending.has(key))return pending.get(key);
 const work=withHistoryLock('nfl-research-board|'+key,async()=>{
  let saved=(await readDurableHistory<any>('nfl','locked_research_'+market,day).catch(()=>[]))[0];
  if(!saved){
   let candidate:any=null;
   await visitHistorySnapshots('nfl',market,day,s=>{const next=selectNflLockedBoard([s],market,day,now);if(next&&(!candidate||next.rows.length>candidate.rows.length||next.rows.length===candidate.rows.length&&Date.parse(next.capturedAt)>Date.parse(candidate.capturedAt)))candidate=next});
   if(!candidate)return null;
   saved=candidate;
   // Local persistence completes before cloud replication; display does not wait for it.
   void writeDurableHistory('nfl','locked_research_'+market,day,[saved]).catch(e=>console.error('[NFL board persistence]',e));
  }
  return {success:true,market,boardFrozen:true,boardDay:day,boardCapturedAt:saved.capturedAt,source:'Saved pregame NFL board',updatedAt:new Date(now).toISOString(),rows:saved.rows.map((r:any)=>{
   const g=today.find(g=>String(g.id)===String(r.gameId));
   return {...r,boardFrozen:true,boardCapturedAt:saved.capturedAt,boardDay:day,frozen:true,lockedAtKickoff:true,gameState:g?.state||r.gameState,gameStatus:g?.status||r.gameStatus};
  })};
 }).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
