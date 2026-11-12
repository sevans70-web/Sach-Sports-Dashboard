import {cloudHistoryReadOnly} from '../../../scripts/history-cloud.mjs';
import {estimatedEv} from '@/lib/estimated-ev';
import {reportedFeaturedOriginal} from '@/lib/featured-history-corrections';
import {readPregameBoard} from '@/lib/ranking-board-cache';
import {workerRuntimeBinding} from '@/lib/worker-runtime-secret';
import {distinctFeaturedPlayers,featuredPlayerKeys} from '@/lib/top-plays';
import {retainedTopPlays} from '@/lib/retained-top-plays';
import {readHistorySnapshots} from '@/lib/history-archive';
import {saveFeaturedSelections} from '@/lib/featured-selection-capture';
import {NBA_MARKETS} from '@/lib/nba';
import {NFL_MARKETS} from '@/lib/nfl';
import {CFB_MARKETS} from '@/lib/cfb';
import {NHL_MARKETS} from '@/lib/nhl';
import {CBB_MARKETS} from '@/lib/cbb';
import {WNBA_MARKETS} from '@/lib/wnba';
import {SOCCER_MARKETS} from '@/lib/soccer';
import {BATTER_MARKETS,PITCHER_MARKETS} from '@/lib/mlb';
import {after,NextRequest,NextResponse} from 'next/server';
import {DASHBOARD_SPORTS,type DashboardSport} from '@/lib/dashboard-contract';
import {readDurableHistoryBatch} from '@/lib/durable-history';
import {dashboardDay} from '@/lib/dashboard-contract';
import {updateTopPlayMarket} from '@/lib/top-plays-store';
import {topPlayMarketState,topPlayMarketRows} from '@/lib/top-plays-store';
import {FEATURED_STREAMS,mergeFeaturedOriginals,readFeaturedOriginals} from '@/lib/featured-originals';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 try{return await featuredResponse(req);}
 catch(error){console.error('[top-plays] saved featured read failed',{error:error instanceof Error?error.message:String(error)});return NextResponse.json({success:false,error:'Saved featured selections temporarily unavailable'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
async function featuredResponse(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'';
 if(!DASHBOARD_SPORTS.includes(sport as DashboardSport))return NextResponse.json({error:'Unsupported sport'},{status:400});
 const day=dashboardDay(new Date());
 const definitions:Record<string,readonly (readonly any[])[]>={nba:NBA_MARKETS,nfl:NFL_MARKETS,cfb:CFB_MARKETS,nhl:[...NHL_MARKETS,['first_goal']],cbb:CBB_MARKETS,wnba:WNBA_MARKETS,soccer:SOCCER_MARKETS,mlb:[...BATTER_MARKETS,...PITCHER_MARKETS]};
 const markets=[...new Set(definitions[sport].map(m=>String(m[0])))];
 const [saved,cached]=await Promise.all([
  readDurableHistoryBatch(sport,[...markets.map(m=>'featured_'+m),...FEATURED_STREAMS],day,{requireComplete:true}),
  ['nba','nfl','nhl'].includes(sport)
   ? Promise.all(markets.map(market=>readPregameBoard(workerRuntimeBinding('VINEXT_KV_CACHE'),sport,market,day)))
   : Promise.resolve([]),
 ]);
 for(const record of saved){const board=record.payload?.[0],stamp=Date.parse(board?.featuredCapturedAt||'');if(board&&Number.isFinite(stamp)&&Date.now()-stamp<15*60000)updateTopPlayMarket(sport,board,stamp);}
 for(const entry of cached)if(entry)updateTopPlayMarket(sport,entry.board,entry.capturedAt);
 if(sport==='nfl'&&!topPlayMarketState(sport).plays.some(card=>card.key==='play'&&card.pick)){
  const quarterMarkets=['q1_rushing_yards','q1_passing_yards','q1_receiving_yards'].filter(market=>!cached.some(entry=>entry?.board.market===market));
  const fetchQuarter=async(market:string)=>{
   const {GET}=await import('../nfl/rankings/route');
   const response=await GET(new NextRequest(`https://sach-capture.internal/api/nfl/rankings?market=${market}&day=${day}`));
   const board=await response.json();
   if(board?.rows?.length)updateTopPlayMarket(sport,board);
  };
  const work=Promise.allSettled(quarterMarkets.map(fetchQuarter));
  let timeout:ReturnType<typeof setTimeout>|undefined;
  await Promise.race([work,new Promise(resolve=>{timeout=setTimeout(resolve,4500)})]);
  clearTimeout(timeout);
  after(async()=>{await work});
 }
 const scorerMarket=sport==='nhl'?'first_goal':sport==='nfl'?'first_td':null;
 if(scorerMarket&&!topPlayMarketRows(sport).some(row=>row.market===scorerMarket&&Date.parse(row.gameTime)>Date.now())){
  try{
   const board=sport==='nhl'
    ?await (await import('@/lib/nhl-rankings-server')).buildNhlFirstGoalBoard()
    :await (await (await import('../nfl/rankings/route')).GET(
      new NextRequest('https://sach-capture.internal/api/nfl/rankings?market=first_td'))).json();
   if(board?.rows?.length)updateTopPlayMarket(sport,board);
  }catch{ /* Saved selections remain available during a provider failure. */ }
 }
 const state=topPlayMarketState(sport),selectionDay=state.slateDay;
 const previous=selectionDay===day?mergeFeaturedOriginals(saved,day):await readFeaturedOriginals(sport,selectionDay);
 const boards=saved.filter(r=>!FEATURED_STREAMS.includes(r.stream)).map(r=>r.payload?.[0]).filter(Boolean);
 // First-basket refreshes legitimately become empty at tipoff. Original scorer
 // quotes remain in the immutable research archive and must not disappear.
 if(['nba','wnba','cbb'].includes(sport)&&!state.plays.find(p=>p.key==='first')?.pick&&!previous.find((p:any)=>p.key==='first')?.pick){
  const snapshots=await readHistorySnapshots(sport,'first_basket',day,true).catch(()=>[]);
  boards.push(...snapshots.map(s=>({...s.payload,capturedAt:s.capturedAt})));
 }
 const retained=retainedTopPlays(boards,sport);
 const originals=state.plays.map(card=>({...card,pick:previous.find((p:any)=>p.key===card.key)?.pick||retained.find(p=>p.key===card.key)?.pick||null}));
 state.plays=topPlayMarketState(sport,Date.now(),originals).plays;
 const used=new Set<string>();
 state.plays=state.plays.map(card=>{
  // A verified choice saved for this slate is immutable, even before kickoff.
  const options=[previous.find((p:any)=>p.key===card.key)?.pick,card.pick,retained.find(p=>p.key===card.key)?.pick];
  for(const pick of options){
   if(!pick||dashboardDay(pick.row.gameTime)!==selectionDay)continue;
   const keys=featuredPlayerKeys(pick.row);
   if(keys.some(key=>used.has(key)))continue;keys.forEach(key=>used.add(key));
   return {...card,pick:pick===card.pick?pick:{...pick,row:{...pick.row,featuredRetained:true}}};
  }
  return {...card,pick:null};
 });
 state.plays=distinctFeaturedPlayers(state.plays);
 // Retained originals were already merged. Empty categories have nothing
 // to persist: avoid an optional cloud retry causing a 500 or any empty write.
 if(!cloudHistoryReadOnly()&&state.plays.some(card=>card.pick))state.plays=await saveFeaturedSelections(sport,state.plays,selectionDay,Date.now(),work=>after(work),topPlayMarketRows(sport));
 const presented={...state,plays:state.plays.map(card=>{const reportedOriginal=reportedFeaturedOriginal(sport,selectionDay,card.key);return reportedOriginal?{...card,pick:null,reportedOriginal}:card.pick?{...card,pick:{...card.pick,row:{...card.pick.row,estimatedEv:estimatedEv(card.pick.row)}}}:card;})};
 return NextResponse.json(presented,{headers:{'Cache-Control':'no-store'}});
}

