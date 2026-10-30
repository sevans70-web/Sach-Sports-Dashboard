import {estimatedEv} from '@/lib/estimated-ev';
import {reportedFeaturedOriginal} from '@/lib/featured-history-corrections';
import {distinctFeaturedPlayers} from '@/lib/top-plays';
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
import {readDurableHistoryBatch,readDurableHistory} from '@/lib/durable-history';
import {dashboardDay} from '@/lib/dashboard-contract';
import {updateTopPlayMarket} from '@/lib/top-plays-store';
import {topPlayMarketState,topPlayMarketRows} from '@/lib/top-plays-store';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest){
 const sport=req.nextUrl.searchParams.get('sport')||'';
 if(!DASHBOARD_SPORTS.includes(sport as DashboardSport))return NextResponse.json({error:'Unsupported sport'},{status:400});
 const day=dashboardDay(new Date());
 const definitions:Record<string,readonly (readonly any[])[]>={nba:NBA_MARKETS,nfl:NFL_MARKETS,cfb:CFB_MARKETS,nhl:NHL_MARKETS,cbb:CBB_MARKETS,wnba:WNBA_MARKETS,soccer:SOCCER_MARKETS,mlb:[...BATTER_MARKETS,...PITCHER_MARKETS]};
 const markets=[...new Set(definitions[sport].map(m=>String(m[0])))];
 const saved=await readDurableHistoryBatch(sport,[...markets.map(m=>'featured_'+m),'featured_selections'],day).catch(()=>[]);
 for(const record of saved){const board=record.payload?.[0],stamp=Date.parse(board?.featuredCapturedAt||'');if(board&&Number.isFinite(stamp)&&Date.now()-stamp<15*60000)updateTopPlayMarket(sport,board,stamp);}
 const state=topPlayMarketState(sport),selectionDay=state.slateDay;
 const previous=selectionDay===day?saved.find(r=>r.stream==='featured_selections')?.payload||[]:await readDurableHistory<any>(sport,'featured_selections',selectionDay).catch(()=>[]);
 const boards=saved.filter(r=>r.stream!=='featured_selections').map(r=>r.payload?.[0]).filter(Boolean);
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
   const id=String(pick.row.playerId||pick.row.playerName).trim().toLowerCase();
   if(used.has(id))continue;used.add(id);
   return {...card,pick:pick===card.pick?pick:{...pick,row:{...pick.row,featuredRetained:true}}};
  }
  return {...card,pick:null};
 });
 state.plays=distinctFeaturedPlayers(state.plays);
 // Retained originals were already merged. Empty categories have nothing
 // to persist: avoid an optional cloud retry causing a 500 or any empty write.
 if(state.plays.some(card=>card.pick))state.plays=await saveFeaturedSelections(sport,state.plays,selectionDay,Date.now(),work=>after(work),topPlayMarketRows(sport));
 const presented={...state,plays:state.plays.map(card=>{const reportedOriginal=reportedFeaturedOriginal(sport,selectionDay,card.key);return reportedOriginal?{...card,pick:null,reportedOriginal}:card.pick?{...card,pick:{...card.pick,row:{...card.pick.row,estimatedEv:estimatedEv(card.pick.row)}}}:card;})};
 return NextResponse.json(presented,{headers:{'Cache-Control':'no-store'}});
}

