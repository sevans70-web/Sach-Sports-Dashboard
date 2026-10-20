import {readHistorySnapshots,torontoHistoryDay} from '@/lib/history-archive';
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
 const markets=new Map<string,any[]>();
 // Captures can occur on the fixture day or before it. Read the existing
 // archive without rewriting saved forecasts, bets, grades or quote fields.
 for(const row of needed){
  const market=String(payload.market||row.market||'');if(!market||markets.has(market))continue;
  const days=new Set<string>();
  for(const same of needed.filter((r:any)=>String(payload.market||r.market||'')===market))for(let offset=0;offset<3;offset++)days.add(torontoHistoryDay(new Date(Date.parse(same.gameTime)-offset*86400000)));
  const snapshots=await Promise.all([...days].filter(Boolean).map(day=>readHistorySnapshots(sport,market,day)));
  markets.set(market,snapshots.flat());
 }
 return {...payload,rows:rows.map((row:any)=>row.sportsbookLine!=null?row:{...row,progressQuote:archivedProgressQuote({...row,market:payload.market||row.market},markets.get(String(payload.market||row.market))||[],now)})};
}
