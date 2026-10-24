import {visitHistorySnapshots,torontoHistoryDay} from '@/lib/history-archive';
import {verifiedPropQuote} from '@/lib/prop-integrity';

/** Recover display evidence only; never turn a live quote into a pregame pick. */
export function archivedProgressQuote(row:any,snapshots:any[],now=Date.now()){
 const start=Date.parse(row.gameTime||'');
 if(!row.gameId||!row.playerId||!row.market||!Number.isFinite(start)||start>now)return null;
 let selected:any=null,latest=-Infinity;
 for(const snapshot of snapshots){
  const captured=Date.parse(snapshot?.capturedAt||'');
  if(!Number.isFinite(captured)||captured>=start||captured>now||captured<latest)continue;
  if(snapshot.payload?.kind!=='research_rankings'||snapshot.payload?.market!==row.market)continue;
  for(const saved of snapshot.payload.rows||[]){
   if(String(saved.gameId)!==String(row.gameId)||String(saved.playerId)!==String(row.playerId)||saved.market!==row.market||Date.parse(saved.gameTime)!==start)continue;
   if(saved.quoteVerified!==true||!verifiedPropQuote(saved,captured,true)||Date.parse(saved.capturedAt||saved.savedAt)>captured)continue;
   selected={source:'saved_pregame',gameId:String(saved.gameId),playerId:String(saved.playerId),market:saved.market,
    gameTime:saved.gameTime,sportsbookLine:saved.sportsbookLine,quoteVersion:saved.quoteVersion,
    sportsbook:saved.sportsbook,sportsbookKey:saved.sportsbookKey,quoteId:saved.quoteId,
    lineType:saved.lineType,overPrice:saved.overPrice,underPrice:saved.underPrice,
    quoteUpdatedAt:saved.quoteUpdatedAt,capturedAt:saved.capturedAt||saved.savedAt,archivedAt:snapshot.capturedAt};
   latest=captured;
  }
 }
 return selected;
}

export async function attachRecordedProgressLines(payload:any,sport:string,now=Date.now()){
 if(!Array.isArray(payload?.rows))return payload;
 const rows=payload.rows,needed=rows.filter((r:any)=>r.sportsbookLine==null&&r.gameId&&r.playerId&&Date.parse(r.gameTime)<=now);
 if(!needed.length)return payload;
 const quotes=new Map<any,any>();
 const markets=[...new Set<string>(needed.map((row:any)=>String(payload.market||row.market||'')))];
 for(const market of markets){
  if(!market)continue;
  const players=needed.filter((r:any)=>String(payload.market||r.market||'')===market),days=new Set<string>();
  for(const row of players)for(let offset=0;offset<3;offset++)days.add(torontoHistoryDay(new Date(Date.parse(row.gameTime)-offset*86400000)));
  for(const day of [...days].filter(Boolean))await visitHistorySnapshots(sport,market,day,snapshot=>{
   for(const row of players){
    const candidate=archivedProgressQuote({...row,market},[snapshot],now),old=quotes.get(row);
    if(candidate&&(!old||Date.parse(candidate.archivedAt)>Date.parse(old.archivedAt)))quotes.set(row,candidate);
   }
  });
 }
 return {...payload,rows:rows.map((row:any)=>row.sportsbookLine!=null?row:{...row,progressQuote:quotes.get(row)||null})};
}
