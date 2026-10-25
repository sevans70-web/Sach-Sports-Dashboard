import {verifiedPropQuote} from '@/lib/prop-integrity';
import {footballSlate,independentFootballRankings} from '@/lib/football-slate-rankings';
import {dashboardDay} from '@/lib/dashboard-contract';
/** Original locked evidence is immediately renderable. Only fresh, recorded
 * pregame prices can fill blocks that have not started; refresh happens later. */
export function retainedNflRankingPayload(locked:any,published:any,market:string,day:string,now=Date.now()){
 const frozen=(locked?.rows||[]).filter((r:any)=>r.market===market&&dashboardDay(r.gameTime)===day);
 const blocks=new Set(locked?.lockedSlates||[]);
 const upcoming=published?.market===market?(published.rows||[]).filter((r:any)=>{
  const capture=Date.parse(r.boardCapturedAt||published.featuredCapturedAt||r.capturedAt||'');
  return r.market===market&&dashboardDay(r.gameTime)===day&&Date.parse(r.gameTime)>now&&!blocks.has(footballSlate(r.gameTime))&&Number.isFinite(capture)&&capture<=now&&capture<Date.parse(r.gameTime)&&verifiedPropQuote(r,now);
 }):[];
 const rows=[...frozen,...independentFootballRankings(upcoming,25,day)];
 if(!rows.length)return null;
 return {success:true,market,rows,boardDay:day,lockedSlates:[...blocks],boardFrozen:rows.every(r=>r.boardFrozen===true),refreshing:true,
  validRankingCount:rows.length,publicRankingCount:rows.length,source:'Saved pregame NFL slate boards',updatedAt:new Date(now).toISOString()};
}
