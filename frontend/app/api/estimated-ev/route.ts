import {verifiedPropQuote} from '@/lib/prop-integrity';
import {selectSavedQuoteEvidence} from '@/lib/saved-quote-evidence';
import {predictionProbability,predictionProbabilityText} from '@/lib/prediction-probability';
import {promises as fs} from 'node:fs';
import path from 'node:path';
import {NextRequest,NextResponse} from 'next/server';
import {DASHBOARD_SPORTS,type DashboardSport,dashboardDay} from '@/lib/dashboard-contract';
import {historyRoot} from '@/lib/durable-history';
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
 for(const name of names)try{
  const records=JSON.parse(await fs.readFile(path.join(dir,name),'utf8'));if(!Array.isArray(records))continue;
  for(const record of records){const candidates=record.pick?.row?[record.pick.row]:record.rows||[];
   for(const r of candidates)if(String(r.playerId)===playerId&&r.market===market&&(!gameId||String(r.gameId)===gameId)&&(!quoteId||r.quoteId===quoteId))rows.push({...r,_featured:!!record.pick,boardCapturedAt:r.boardCapturedAt||record.capturedAt||record.featuredCapturedAt});
  }
 }catch{}
 const {row,ambiguous}=selectSavedQuoteEvidence(rows,gameId,quoteId,Date.now(),forecastAt);
 const f=row?.researchForecast,capture=Date.parse(row?.boardCapturedAt||''),calculated=Date.parse(f?.calculatedAt||''),start=Date.parse(row?.gameTime||'');
 const forecast=f?.status==='available'&&Number.isFinite(f.projection)&&Number.isFinite(calculated)&&calculated<=capture&&capture<start&&capture<=Date.now()&&verifiedPropQuote(row,capture,true)?{projection:f.projection,line:row.sportsbookLine,playerId:row.playerId,gameId:row.gameId,quoteId:row.quoteId,calculatedAt:f.calculatedAt}:null;
 return NextResponse.json({forecast,probability:predictionProbability(row),probabilityText:predictionProbabilityText(row),ev:estimatedEv(row),text:estimatedEvText(row),notice:ambiguous?'Select a specific game and saved quote to view its EV':estimatedEvNotice(row)},{headers:{'Cache-Control':'no-store'}});
}
