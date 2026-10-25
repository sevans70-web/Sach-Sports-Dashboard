import {FOOTBALL_SLATES,footballSlate,selectRecordedFootballSlate} from '@/lib/football-slate-rankings';
import {readDurableHistory,writeDurableHistory} from '@/lib/durable-history';
import {visitHistorySnapshots,torontoHistoryDay} from '@/lib/history-archive';
import {withHistoryLock} from '@/lib/history-lock';

/** Recover the complete research board, including rows withheld from betting history.
 * Never reconstruct a pregame projection or selection from live statistics. */
export function selectNflLockedBoard(snapshots:any[],market:string,day:string,now=Date.now()){
 let best:any=null;
 for(const s of snapshots){
  const at=Date.parse(s.capturedAt),p=s.payload;
  if(!Number.isFinite(at)||at>now||(p?.kind!=null&&p.kind!=='research_rankings')||p?.market!==market)continue;
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
 const boundaries=FOOTBALL_SLATES.map(slate=>({slate,times:today.filter(g=>footballSlate(g.date)===slate).map(g=>Date.parse(g.date))})).filter(b=>b.times.length&&Math.min(...b.times)<=now);
 if(!boundaries.length)return null;
 const key=market+'|'+day;
 if(pending.has(key))return pending.get(key);
 const work=withHistoryLock('nfl-research-board|'+key,async()=>{
  const blocks:any[]=[],snapshots:any[]=[];let loaded=false;
  for(const b of boundaries){
   const stream='slate_locked_v2_'+market+'_'+b.slate;
   let saved=(await readDurableHistory<any>('nfl',stream,day).catch(()=>[]))[0];
   if(!saved){
    if(!loaded){await visitHistorySnapshots('nfl',market,day,s=>snapshots.push(s),true);loaded=true}
    saved=selectRecordedFootballSlate(snapshots,market,day,b.slate,Math.min(...b.times));
    if(saved)void writeDurableHistory('nfl',stream,day,[saved]).catch(e=>console.error('[NFL board persistence]',e));
   }
   if(saved)blocks.push({...saved,slateKey:b.slate});
  }
  return {success:true,market,boardDay:day,lockedSlates:blocks.map(b=>b.slateKey),source:'Saved pregame NFL slate boards',updatedAt:new Date(now).toISOString(),rows:blocks.flatMap(saved=>saved.rows.map((r:any)=>{
   const g=today.find(g=>String(g.id)===String(r.gameId));
   return {...r,slateKey:saved.slateKey,boardFrozen:true,boardCapturedAt:r.boardCapturedAt||saved.capturedAt,boardDay:day,frozen:true,lockedAtKickoff:true,gameState:g?.state||r.gameState,gameStatus:g?.status||r.gameStatus};
  }))};
 }).finally(()=>pending.delete(key));pending.set(key,work);return work;
}
