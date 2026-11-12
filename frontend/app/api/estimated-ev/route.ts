import {readSavedNhlCardRows} from '@/lib/recorded-progress';
import {savedModelPick} from '@/lib/saved-model-pick';
import {recordedCardForecast} from '@/lib/full-card-forecast';
import {selectSavedQuoteEvidence} from '@/lib/saved-quote-evidence';
import {predictionProbability,predictionProbabilityText} from '@/lib/prediction-probability';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {NextRequest,NextResponse} from 'next/server';
import {DASHBOARD_SPORTS,type DashboardSport,dashboardDay} from '@/lib/dashboard-contract';
import {historyRoot,readDurableHistoryBatch} from '@/lib/durable-history';
import {estimatedEv,estimatedEvText,estimatedEvNotice} from '@/lib/estimated-ev';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const q=req.nextUrl.searchParams,sport=q.get('sport')||'',playerId=q.get('playerId')||'',market=q.get('market')||'',gameId=q.get('gameId'),quoteId=q.get('quoteId'),forecastAt=q.get('forecastAt');
 if(!DASHBOARD_SPORTS.includes(sport as DashboardSport)||!playerId||!market)return NextResponse.json({error:'Unsupported player market'},{status:400});
 const dir=path.join(historyRoot(),sport),cutoff=dashboardDay(new Date(Date.now()-6*86400000)),rows:any[]=[];
 const names=(await fs.readdir(dir).catch(()=>[])).filter(n=>n.endsWith('.json')&&/^(featured_|slate_board_|slate_locked_|locked_research_)/.test(n)&&(n.match(/(\d{4}-\d{2}-\d{2})\.json$/)?.[1]||'')>=cutoff);
 // Prefer the locked featured selection, then original boards. Never read a
 // caller-supplied EV, price or probability as historical evidence.
 names.sort((a,b)=>Number(b.startsWith('featured_selections_'))-Number(a.startsWith('featured_selections_')));
 const collect=(records:any[])=>{
  for(const record of records){
   const candidates=record.pick?.row?[record.pick.row]:record.rows||[];
   for(const r of candidates)if(String(r.playerId)===playerId&&r.market===market&&(!gameId||String(r.gameId)===gameId)&&(!quoteId||r.quoteId===quoteId))
    rows.push({...r,_featured:!!record.pick,boardCapturedAt:r.boardCapturedAt||record.capturedAt||record.featuredCapturedAt});
  }
 };
 for(const name of names)try{
  const records=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));
  if(Array.isArray(records))collect(records);
 }catch{}
 if(gameId&&quoteId&&!rows.length){
  const today=dashboardDay(new Date()),gameDay=dashboardDay(q.get('gameTime')||'');
  const days=[...new Set([today,gameDay].filter(day=>day&&day>=cutoff))];
  const streams=['featured_selections','featured_'+market,'slate_board_'+market,'slate_locked_'+market,'locked_research_'+market];
  const documents=await Promise.all(days.map(day=>readDurableHistoryBatch(sport,streams,day)));
  for(const day of documents)for(const document of day)collect(document.payload);
 }
 if(sport==='nhl'&&gameId&&quoteId){
  const requested={playerId,gameId,gameTime:q.get('gameTime')};
  const saved=(await readSavedNhlCardRows(market,[requested])).get(requested);
  if(saved?.quoteId===quoteId)rows.push(saved);
 }
 const {row,ambiguous}=selectSavedQuoteEvidence(rows,gameId,quoteId,Date.now(),forecastAt);
 const pick=sport==='nhl'?savedModelPick(row):null;
 const selection=pick?{playerId:row.playerId,gameId:row.gameId,quoteId:row.quoteId,calculatedAt:pick.calculatedAt,
  side:pick.side,line:pick.line,odds:pick.price,sportsbook:row.sportsbook}:null;
 const forecast=recordedCardForecast(row);
 return NextResponse.json({forecast,selection,probability:predictionProbability(row),probabilityText:predictionProbabilityText(row),ev:estimatedEv(row),text:estimatedEvText(row),notice:ambiguous?'Select a specific game and saved quote to view its EV':estimatedEvNotice(row)},{headers:{'Cache-Control':'no-store'}});
}
