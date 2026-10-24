import {publicNbaRanking} from '@/lib/public-card-metrics';
import {excludeUnavailableRanking} from '@/lib/ranking-availability';

/** Apply eligibility to the entire slate before imposing the public limit. */
export function selectNbaCandidates(rows:any[],market:string,now=Date.now()){
 const seen=new Set<string>();
 const selected=rows.filter(row=>{
  const key=String(row.gameId)+'|'+String(row.playerId);
  if(seen.has(key)||excludeUnavailableRanking(row)||!publicNbaRanking({...row,market:row.market||market},now))return false;
  seen.add(key);return true;
 }).slice(0,25);
 const occupied=new Set(selected.filter(r=>!r.recoveredRecordedCandidate).map(r=>r.rank));
 const ranked=selected.map(row=>{
  if(!row.recoveredRecordedCandidate)return row;
  let rank=1;while(occupied.has(rank))rank++;occupied.add(rank);
  return {...row,rank};
 });
 return ranked.some(r=>r.recoveredRecordedCandidate)?ranked.sort((a,b)=>a.rank-b.rank):ranked;
}

/** Recover only decisions actually recorded before the daily lock. Never fit
 * a replacement from live results, or replace a newer recorded abstention. */
export function recordedNbaCandidates(snapshots:any[],market:string,day:string,lockAt:number,now=Date.now()){
 const latest=new Map<string,any>();
 for(const snapshot of [...snapshots].sort((a,b)=>Date.parse(a.capturedAt)-Date.parse(b.capturedAt))){
  const capture=Date.parse(snapshot.capturedAt||'');
  if(!Number.isFinite(capture)||capture>=lockAt||capture>now||snapshot.payload?.kind!=='research_rankings'||snapshot.payload.market!==market)continue;
  for(const row of snapshot.payload.rows||[]){
   if(row.market!==market||!row.gameId||!row.playerId||!Number.isFinite(Date.parse(row.gameTime))||Date.parse(row.gameTime)<lockAt)continue;
   const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(row.gameTime));
   const value=(key:string)=>parts.find(p=>p.type===key)?.value;
   if(`${value('year')}-${value('month')}-${value('day')}`!==day)continue;
   latest.set(row.gameId+'|'+row.playerId,{...row,boardFrozen:true,frozen:true,lockedAtKickoff:true,boardCapturedAt:snapshot.capturedAt,boardDay:day,recoveredRecordedCandidate:true});
  }
 }
 return [...latest.values()];
}
