import {cloudConfigured,cloudRequest} from '../scripts/history-cloud.mjs';
import {captureVersionOneChecksum} from '../scripts/worker-pregame-history.mjs';
import {retentionCutoff} from '../scripts/retention-policy.mjs';
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

export function immutableNhlProgressQuote(row:any,original:any,now=Date.now()){
 const receipt=original?.payload;
 const quote=receipt?.quote;
 const start=Date.parse(row.gameTime||'');
 const captured=Date.parse(receipt?.capturedAt||'');
 const updated=Date.parse(quote?.quoteUpdatedAt||'');
 if(original?.sport!=='nhl'||receipt?.sport!=='nhl'||original.market!==row.market||receipt.market!==row.market||
    String(original.game_id)!==String(row.gameId)||String(receipt.gameId)!==String(row.gameId)||
    String(original.player_id)!==String(row.playerId)||String(receipt.playerId)!==String(row.playerId)||
    !Number.isFinite(start)||start>now||Date.parse(original.game_time)!==start||Date.parse(receipt.gameTime)!==start||
    !Number.isFinite(captured)||captured>=start||!Number.isFinite(updated)||updated>=start||
    updated!==Date.parse(original.quote_updated_at)||quote?.lineType!=='main'||
    !Number.isFinite(quote.line)||quote.line<=0||quote.line!==original.sportsbook_line||
    !/^[0-9a-f]{64}$/.test(original.checksum||'')||captureVersionOneChecksum(receipt)!==original.checksum)return null;
 const progressQuote={source:'saved_pregame',gameId:String(row.gameId),playerId:String(row.playerId),market:row.market,
  gameTime:receipt.gameTime,sportsbookLine:quote.line,quoteVersion:receipt.version,
  sportsbook:quote.sportsbook,sportsbookKey:quote.sportsbookKey,quoteId:quote.quoteId,lineType:quote.lineType,
  overPrice:quote.overPrice,underPrice:quote.underPrice,quoteUpdatedAt:quote.quoteUpdatedAt,capturedAt:receipt.capturedAt};
 return verifiedPropQuote(progressQuote,captured,true)?progressQuote:null;
}

async function readNhlProgressOriginals(market:string,players:any[]){
 const ids=(key:string)=>[...new Set(players.map(row=>String(row[key])).filter(id=>/^\d{1,24}$/.test(id)))];
 const games=ids('gameId'),athletes=ids('playerId');
 if(!games.length||!athletes.length)return [];
 const query=new URLSearchParams({select:'sport,market,game_id,player_id,game_time,quote_updated_at,sportsbook_line,checksum,payload',
  sport:'eq.nhl',market:'eq.'+market,game_id:`in.(${games.join(',')})`,player_id:`in.(${athletes.join(',')})`});
 return await cloudRequest('worker_pregame_originals?'+query.toString(),{signal:AbortSignal.timeout(2500)});
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
  if(sport==='nhl'&&cloudConfigured())try{
   const originals=await readNhlProgressOriginals(market,players);
   const byPlayerGame=new Map<string,any>(originals.map((row:any)=>[`${row.player_id}|${row.game_id}`,row]));
   for(const row of players){
    const candidate=immutableNhlProgressQuote({...row,market},byPlayerGame.get(`${row.playerId}|${row.gameId}`),now);
    if(candidate)quotes.set(row,candidate);
   }
  }catch(e){console.error('[NHL progress originals unavailable]',market,e instanceof Error?e.message:String(e));}
  const unresolved=players.filter((row:any)=>!quotes.has(row));
  for(const row of unresolved)for(let offset=0;offset<3;offset++)days.add(torontoHistoryDay(new Date(Date.parse(row.gameTime)-offset*86400000)));
  for(const day of [...days].filter(Boolean))try{await visitHistorySnapshots(sport,market,day,snapshot=>{
   for(const row of unresolved){
    const candidate=archivedProgressQuote({...row,market},[snapshot],now),old=quotes.get(row);
    if(candidate&&(!old||Date.parse(candidate.archivedAt)>Date.parse(old.archivedAt)))quotes.set(row,candidate);
   }
  },day>=retentionCutoff());}catch(e){console.error('[progress archive unavailable]',sport,market,day,e instanceof Error?e.message:String(e));}
 }
 return {...payload,rows:rows.map((row:any)=>row.sportsbookLine!=null?row:{...row,progressQuote:quotes.get(row)||null})};
}
