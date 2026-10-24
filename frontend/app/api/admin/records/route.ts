import {NextRequest} from 'next/server';
import {adminJson,currentAdmin} from '@/lib/admin-auth';
import {ADMIN_SPORTS,adminResult,adminResultCounts} from '@/lib/admin-policy';
import {HISTORY_PERIODS,readSavedPerformance} from '@/lib/saved-performance';
import {guardPerformancePayload} from '@/lib/prop-integrity';
import {readSoccerPredictions} from '@/lib/soccer-predictions';
import {assertHiddenHistoryReadable} from '@/lib/hidden-admin-history';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(req:NextRequest){
 if(!await currentAdmin())return adminJson({error:'Administrator sign-in required.'},401);
 const sport=req.nextUrl.searchParams.get('sport')||'nfl',period=req.nextUrl.searchParams.get('period')||'Today';
 if(!(ADMIN_SPORTS as readonly string[]).includes(sport)||!(HISTORY_PERIODS as readonly string[]).includes(period))return adminJson({error:'Unsupported sport or period.'},400);
 try{
  let saved:any[];
  if(sport==='soccer'){
   // Preserve the existing hidden soccer path and scope.
   if(!['Today','Yesterday','Week'].includes(period))return adminJson({error:'Soccer history supports Today, Yesterday and Week.'},400);
   await assertHiddenHistoryReadable('soccer');saved=await readSoccerPredictions(period);
  }else{
   const data=await readSavedPerformance(sport,period);if(!data.coverage.complete)throw new Error('Incomplete saved history');saved=data.records;
  }
  const guarded=guardPerformancePayload({predictions:saved},sport);
  const records=guarded.predictions.map(adminResult).sort((a:any,b:any)=>String(b.gameTime||b.savedAt||'').localeCompare(String(a.gameTime||a.savedAt||'')));
  return adminJson({sport,period,readOnly:true,records,counts:adminResultCounts(records),updatedAt:new Date().toISOString()});
 }catch{return adminJson({error:'Could not load complete saved history. Partial counts are not displayed.'},503);}
}
