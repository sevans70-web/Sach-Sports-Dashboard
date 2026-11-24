import {performancePublicResponse} from '@/lib/performance-public-response';
import {workerPerformanceResponse,workerPerformanceSport} from '@/lib/worker-performance';
import {readCfbSavedBoards} from '@/lib/cfb-saved-boards';
import {performanceResponseScope} from '@/lib/performance-response-scope';
import {performanceView} from '@/lib/performance-view';
import {schedulePerformanceRecovery} from '@/lib/performance-recovery-scheduler';
import {NextRequest,NextResponse} from 'next/server';
import {HISTORY_SPORTS,HISTORY_PERIODS,historyDays,readSavedPerformance} from '@/lib/saved-performance';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'nba',period=req.nextUrl.searchParams.get('period')||'Today';
 if(!(HISTORY_SPORTS as readonly string[]).includes(sport)||!(HISTORY_PERIODS as readonly string[]).includes(period))return NextResponse.json({success:false,error:'Unsupported history scope'},{status:400});
 const from=req.nextUrl.searchParams.get('archive_from'),to=req.nextUrl.searchParams.get('archive_to');
 if(from!==null||to!==null){
  const now=new Date(),days=historyDays('Season',now);
  if(period!=='Season'||!['mlb','wnba'].includes(sport)||!from||!to||!days.has(from)||!days.has(to)||from>to||Date.parse(to)-Date.parse(from)>6*86400000){
   return NextResponse.json({success:false,error:'Choose an MLB or WNBA archive source range of up to seven days within the season.'},{status:400});
  }
  try{
   const {records,coverage}=await readSavedPerformance(sport,period,now,undefined,{observe:false,storage:'cloud',archiveRange:{from,to}});
   return NextResponse.json({success:coverage.complete,sport,archiveRange:{from,to},archiveDocuments:coverage.driveDocuments,records:records.length,errors:coverage.errors},{headers:{'Cache-Control':'no-store'}});
  }catch{return NextResponse.json({success:false,error:'Drive archive is unavailable.'},{status:503});}
 }
 try{
  if(workerPerformanceSport(sport))return new NextResponse(await workerPerformanceResponse(sport,period,req.nextUrl.searchParams.get('market'),req.nextUrl.searchParams.get('group')),{headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  const data=await performanceView(sport,period,schedulePerformanceRecovery),market=req.nextUrl.searchParams.get('market'),group=req.nextUrl.searchParams.get('group'),league=sport==='soccer'?req.nextUrl.searchParams.get('league'):null;
  const scopedRecords=performanceResponseScope(data.records,period,new Date(),league);
  if(sport==='cfb'&&req.nextUrl.searchParams.get('includeBoards')==='true'){
   const local=await readCfbSavedBoards(period),key=(r:any)=>[r.playerId,r.gameId,r.market].join('|');
   const indexes=new Map(scopedRecords.map((r,i)=>[key(r),i]));
   for(const row of local){const index=indexes.get(key(row));if(index==null){scopedRecords.push(row);continue;}
    const original=scopedRecords[index];
    if(original.sportsbookLine==null&&original.line==null&&row.quoteEvidence===true){
     const settled=['hit','miss','push','void'].includes(original.status);
     scopedRecords[index]={...row,...(settled?{status:original.status,actual:original.actual}:{}),savedAt:row.savedAt||original.savedAt};
    }
   }
  }
  return NextResponse.json(performancePublicResponse(data,sport,period,market,group,league,Date.now(),scopedRecords),{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({success:false,connected:false,error:'Saved history storage is unavailable. Counts cannot be verified.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
