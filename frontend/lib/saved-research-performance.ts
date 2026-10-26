import {dashboardDay} from '@/lib/dashboard-contract';
import {officialFeaturedResult} from '@/lib/featured-official-result';
import {internalAppOrigin} from '@/lib/internal-app-origin';
/** Recover the recorded fitted forecast, never a forecast fitted after the outcome. */
export function savedResearchDecisions(boards:any[],capturedAt?:string){
 return boards.flatMap(board=>(board?.rows||[]).flatMap((r:any)=>{
  const at=r.boardCapturedAt||board.capturedAt||board.boardCapturedAt||board.featuredCapturedAt||capturedAt;
  const capture=Date.parse(at||''),start=Date.parse(r.gameTime||''),f=r.researchForecast,line=r.sportsbookLine;
  if(!r.playerId||!r.gameId||!r.market||!Number.isFinite(capture)||!Number.isFinite(start)||capture>=start||r.quoteVerified!==true||typeof line!=='number'||!Number.isFinite(line)||f?.status!=='available'||typeof f.projection!=='number'||!Number.isFinite(f.projection))return [];
  const side=f.modelSelection?.side|| (f.projection>line?'OVER':f.projection<line?'UNDER':null);
  if(!['OVER','UNDER'].includes(side))return [];
  const gameDate=dashboardDay(r.gameTime),key=[gameDate,r.market,r.gameId,r.playerId].join('|');
  return [{...r,key,gameDate,savedAt:at,boardCapturedAt:at,pickSide:side,prediction:side,modelProjection:f.projection,status:'pending',actual:null,historyBasis:'original_saved_research_forecast'}];
 }));
}
const cache=new Map<string,{at:number;payload:any}>();
export async function observeSavedResearch(records:any[],sport:string){
 if(!['nfl','cfb','nba','wnba','cbb','nhl'].includes(sport))return records;
 const pending=records.filter(r=>r.historyBasis==='original_saved_research_forecast'&&Date.parse(r.gameTime)<Date.now()),ids=[...new Set<string>(pending.map(r=>String(r.gameId)))],observations=new Map<string,any>();
 let index=0;
 await Promise.all(Array.from({length:Math.min(4,ids.length)},async()=>{while(index<ids.length){const id=ids[index++],key=sport+'|'+id,cached=cache.get(key);if(cached&&Date.now()-cached.at<30000){observations.set(id,cached.payload);continue;}
  const base=['nfl','cfb'].includes(sport)?'/api/football/live-player-stats?sport='+sport:sport==='nhl'?'/api/nhl/live-player-stats?':'/api/basketball/live-player-stats?sport='+sport;
  try{const response=await fetch(internalAppOrigin()+base+(base.endsWith('?')?'':'&')+'gameId='+encodeURIComponent(id),{signal:AbortSignal.timeout(2500),cache:'no-store'});if(response.ok){const payload=await response.json();if(cache.size>512)cache.clear();cache.set(key,{at:Date.now(),payload});observations.set(id,payload);}}catch{}
 }}));
 return records.map(row=>{if(row.historyBasis!=='original_saved_research_forecast')return row;const result=officialFeaturedResult(row,observations.get(String(row.gameId)));return result?{...row,...result}:row;});
}
