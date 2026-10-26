import {predictionAccuracy,predictionProbability} from '@/lib/prediction-probability';
import {performanceView} from '@/lib/performance-view';
import {dashboardDay} from '@/lib/dashboard-contract';
import {after,NextRequest,NextResponse} from 'next/server';
import {HISTORY_SPORTS,HISTORY_PERIODS,readSavedPerformance,savedHistorySummary,historyGroup} from '@/lib/saved-performance';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'nba',period=req.nextUrl.searchParams.get('period')||'Today';
 if(!(HISTORY_SPORTS as readonly string[]).includes(sport)||!(HISTORY_PERIODS as readonly string[]).includes(period))return NextResponse.json({success:false,error:'Unsupported history scope'},{status:400});
 try{
  const data=await performanceView(sport,period,after),market=req.nextUrl.searchParams.get('market'),group=req.nextUrl.searchParams.get('group');
  const selected=data.records.filter(r=>(!market||r.market===market)&&(!group||historyGroup(r,sport)===group));
  const categories=Object.fromEntries([...new Set(data.records.map(r=>String(r.market)))].map(key=>[key,savedHistorySummary(data.records.filter(r=>r.market===key))]));
  return NextResponse.json({success:data.records.length>0||data.coverage.complete,connected:data.records.length>0||data.coverage.complete,partial:!data.coverage.complete,sport,period,readOnly:true,researchSummary:savedHistorySummary(selected),probabilityAccuracy:predictionAccuracy(selected.map(r=>({...r,sport}))),overallSummary:data.summary,categories,coverage:data.coverage,
   // Preserve the saved call and grade. These are historical forecasts, not newly validated picks.
   records:selected.sort((a,b)=>String(b.gameTime||b.savedAt).localeCompare(String(a.gameTime||a.savedAt))).map(r=>({key:r.key,playerName:r.playerName,market:r.market,gameDate:Number.isFinite(Date.parse(r.gameTime))?dashboardDay(r.gameTime):r.gameDate,storedGameDate:r.gameDate,gameTime:r.gameTime,savedAt:r.savedAt,pick:r.pickSide||r.pick||null,line:r.sportsbookLine??null,projection:r.modelProjection??null,actual:r.actual??null,status:r.status,gradedAt:r.gradedAt,legacyResult:r.legacyResult||null,probability:predictionProbability(r)})),
   updatedAt:data.snapshotAt||new Date().toISOString(),refreshing:data.refreshing===true},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({success:false,connected:false,error:'Saved history storage is unavailable. Counts cannot be verified.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
