import {withHistoryLock} from '@/lib/history-lock';
import {officialFeaturedResult} from '@/lib/featured-official-result';
import {internalAppOrigin} from '@/lib/internal-app-origin';
import {matchingFeaturedResult,featuredSelectionDispute} from '@/lib/featured-performance-match';
import {after,NextRequest,NextResponse} from 'next/server';
import {DASHBOARD_SPORTS} from '@/lib/dashboard-contract';
import {historyDays,readSavedPerformance} from '@/lib/saved-performance';
import {readDurableHistory,writeDurableHistory} from '@/lib/durable-history';
export const dynamic='force-dynamic';
const CATEGORIES=['play','value','first','long'] as const;
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'nfl',period=req.nextUrl.searchParams.get('period')||'Today';
 if(!DASHBOARD_SPORTS.includes(sport as any)||!['Today','Yesterday','Week','Month','Season'].includes(period))return NextResponse.json({success:false,error:'Invalid scope'},{status:400});
 const days=[...historyDays(period)].sort();
 try{
  const [boards,history]=await Promise.all([
   Promise.all(days.map(async day=>({day,choices:await readDurableHistory<any>(sport,'featured_selections',day).catch(()=>[])}))),
   ['mlb','soccer'].includes(sport)?Promise.resolve({records:[],coverage:{complete:false}}):readSavedPerformance(sport,period).catch(()=>({records:[],coverage:{complete:false}}))
  ]);
  const observations=new Map<string,Promise<any>>();
  const official=(row:any)=>{
   const id=String(row.gameId||'');if(!/^\d+$/.test(id)||Date.parse(row.gameTime)>Date.now())return Promise.resolve(null);
   const path=['nfl','cfb'].includes(sport)?'/api/football/live-player-stats?sport='+sport:['nba','wnba','cbb'].includes(sport)?'/api/basketball/live-player-stats?sport='+sport:sport==='nhl'?'/api/nhl/live-player-stats?':' ';
   if(path===' ')return Promise.resolve(null);
   if(!observations.has(id))observations.set(id,fetch(internalAppOrigin()+path+(path.endsWith('?')?'':'&')+'gameId='+id,{signal:AbortSignal.timeout(2500),cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null));
   return observations.get(id)!;
  };
  const records:any[]=[];
  for(const {day,choices} of boards)for(const card of choices){
   if(!CATEGORIES.includes(card.key)||!card.pick?.row)continue;
   const p=card.pick,row=p.row;
   const gameTime=String(row.gameTime||'');
   const selectionIssue=featuredSelectionDispute(sport,day,card.key);
   const savedGrades=await readDurableHistory<any>(sport,'featured_results',day,true);
   const exact=matchingFeaturedResult(row,[...savedGrades,...history.records]);
   const observed=!selectionIssue&&!exact?officialFeaturedResult(row,await official(row)):null;
   const result=selectionIssue?null:exact||observed;
   if(observed)after(()=>withHistoryLock('featured-results|'+sport+'|'+day,async()=>{const existing=await readDurableHistory<any>(sport,'featured_results',day,true);const key=[card.key,row.playerId,row.gameId,row.market,row.prediction,row.sportsbookLine].join('|');await writeDurableHistory(sport,'featured_results',day,[...existing.filter((r:any)=>r.key!==key),{...row,...observed,key,pickSide:row.prediction}],work=>after(work));}));
   records.push({key:card.key,day,playerName:row.playerName,market:row.market,side:row.prediction||null,line:row.sportsbookLine??null,odds:p.price??null,sportsbook:row.sportsbook||null,gameTime,selectedAt:row.featuredSavedAt||row.boardCapturedAt||row.capturedAt||null,selectionIssue,status:selectionIssue?'unverified':result?.status||'pending',actual:result?.actual??null,verifiedResult:!!result,resultSource:observed?.resultSource||null});
  }
  const categories=Object.fromEntries(CATEGORIES.map(key=>{const items=records.filter(r=>r.key===key&&!r.selectionIssue),hits=items.filter(r=>r.status==='hit').length,misses=items.filter(r=>r.status==='miss').length,pushes=items.filter(r=>r.status==='push').length;return [key,{total:items.length,hits,misses,pushes,pending:items.length-hits-misses-pushes-items.filter(r=>r.status==='void').length,hitRate:hits+misses?Math.round(hits/(hits+misses)*1000)/10:null}]}));
  return NextResponse.json({success:true,sport,period,categories,records,historyComplete:history.coverage.complete,gradePolicy:'Only matching stored results are graded; recorded odds are hypothetical, not placed bets.'},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({success:false,error:'Featured history unavailable; no results inferred'},{status:503})}
}
