import {nbaSlateRows} from '@/lib/nba-slate-scope';
import {selectNbaCandidates} from '@/lib/nba-ranking-candidates';
import {retentionCutoff} from '../scripts/retention-policy.mjs';
import {readDurableHistory,writeDurableHistory} from '@/lib/durable-history';
import {visitHistorySnapshots,torontoHistoryDay} from '@/lib/history-archive';
import {withHistoryLock} from '@/lib/history-lock';
import {verifiedPropQuote} from '@/lib/prop-integrity';

export type NbaSlateBoard={version:1;day:string;market:string;capturedAt:string;lockAt:string;rows:any[];recoveredAt?:string};
const stream=(market:string)=>'slate_board_'+market;
export function nextNbaBoardDay(day=torontoHistoryDay()){
 const date=new Date(day+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+1);return date.toISOString().slice(0,10);
}
export function nbaSlateBoundary(games:any[],now=Date.now(),day=torontoHistoryDay(new Date(now))){
 const today=games.filter(g=>torontoHistoryDay(g.tipoff||g.date||'')===day);
 const times=today.map(g=>Date.parse(g.tipoff||g.date||'')).filter(Number.isFinite);
 return {day,games:today,lockAt:times.length?Math.min(...times):null};
}
export function selectPregameBoard(snapshots:any[],day:string,market:string,lockAt:number,now=Date.now()):NbaSlateBoard|null{
 let best:NbaSlateBoard|null=null;
 for(const snapshot of snapshots){
  const stamp=Date.parse(snapshot.capturedAt||''),p=snapshot.payload;
  if(!Number.isFinite(stamp)||stamp>=lockAt||stamp>now||p?.kind!=='research_rankings'||p.market!==market||!Array.isArray(p.rows))continue;
  const rows=p.rows.filter((r:any)=>r.market===market&&torontoHistoryDay(r.gameTime)===day&&Date.parse(r.gameTime)>=lockAt);
  if(!rows.length||rows.length>25||new Set(rows.map((r:any)=>r.playerId+'|'+r.gameId)).size!==rows.length)continue;
  if(!best||stamp>Date.parse(best.capturedAt))best={version:1,day,market,capturedAt:snapshot.capturedAt,lockAt:new Date(lockAt).toISOString(),rows};
 }
 return best;
}
export async function readNbaSlateBoard(market:string,day:string,sport='nba'):Promise<NbaSlateBoard|null>{
 return (await readDurableHistory<NbaSlateBoard>(sport,stream(market),day,day>=retentionCutoff()))[0]||null;
}
export async function frozenNbaSlateBoard(market:string,games:any[],now=Date.now(),day?:string,sport='nba',deferCloud?:(work:()=>Promise<any>)=>void){
 const boundary=nbaSlateBoundary(games,now,day);
 const stored=await readNbaSlateBoard(market,boundary.day,sport);
 if(boundary.lockAt==null&&stored&&Number.isFinite(Date.parse(stored.lockAt)))boundary.lockAt=Date.parse(stored.lockAt);
 if(boundary.lockAt==null||now<boundary.lockAt)return null;
 return withHistoryLock(sport+'-board|'+market+'|'+boundary.day,async()=>{
  let board=await readNbaSlateBoard(market,boundary.day,sport);
  if(!board||!Number.isFinite(Date.parse(board.capturedAt))||Date.parse(board.capturedAt)>=boundary.lockAt!){
   const days=[boundary.day,torontoHistoryDay(new Date(boundary.lockAt!-86400000)),torontoHistoryDay(new Date(boundary.lockAt!-2*86400000))];
   for(const captureDay of days)await visitHistorySnapshots(sport,market,captureDay,snapshot=>{
    const candidate=selectPregameBoard([snapshot],boundary.day,market,boundary.lockAt!,now);
    if(candidate&&(!board||Date.parse(candidate.capturedAt)>Date.parse(board.capturedAt)))board=candidate;
   },captureDay>=retentionCutoff());
   if(board){board={...board,recoveredAt:new Date(now).toISOString()};await writeDurableHistory(sport,stream(market),boundary.day,[board],deferCloud);}
  }
  const rows=nbaSlateRows(board?.day===boundary.day&&board?.market===market?board.rows:[],market,boundary.day).map(saved=>{
   const game=boundary.games.find(g=>String(g.gameId||g.id)===String(saved.gameId));
   return {...saved,rank:saved.rank,movement:'same',boardFrozen:true,frozen:true,lockedAtKickoff:true,boardCapturedAt:board!.capturedAt,boardDay:boundary.day,
    gameState:game?.state||saved.gameState,gameStatus:game?.status||saved.gameStatus,
    quoteVerified:verifiedPropQuote(saved,now,true),sportsbookLine:verifiedPropQuote(saved,now,true)?saved.sportsbookLine:null};
  });
  return {success:true,market,rows,boardFrozen:true,boardDay:boundary.day,boardCapturedAt:board?.capturedAt||null,verifiedQuoteCount:rows.filter(r=>r.quoteVerified).length,modelSelectionCount:rows.filter(r=>r.researchForecast?.modelSelection).length,
   boardUnavailable:!board,source:board?`Saved pregame ${sport.toUpperCase()} daily board`:'No pregame board was recorded',updatedAt:new Date(now).toISOString()};
 });
}
export async function savePregameNbaSlateBoard(payload:any,games:any[],now=Date.now(),day?:string,sport='nba',deferCloud?:(work:()=>Promise<any>)=>void){
 const b=nbaSlateBoundary(games,now,day);
 if(b.lockAt==null||now>=b.lockAt||!payload?.rows?.length)return payload;
 const rows=payload.rows.filter((r:any)=>torontoHistoryDay(r.gameTime)===b.day).slice(0,25);
 if(!rows.length)return payload;
 const boardSaved=await withHistoryLock(sport+'-board|'+payload.market+'|'+b.day,async()=>{
  if(Date.now()>=b.lockAt!)return false;
  return writeDurableHistory(sport,stream(payload.market),b.day,[{version:1,day:b.day,market:payload.market,capturedAt:new Date(now).toISOString(),lockAt:new Date(b.lockAt!).toISOString(),rows} satisfies NbaSlateBoard],deferCloud);
 });
 return {...payload,boardSaved,boardDay:b.day,boardLockAt:new Date(b.lockAt).toISOString()};
}

/** Fast display during pregame refresh; never carry an expired price, another
 * date, a later snapshot or a post-tipoff reconstruction onto this board. */
export function currentNbaPregameSnapshot(board:NbaSlateBoard|null,market:string,day:string,now=Date.now()){
 if(!board||board.market!==market||board.day!==day||!Number.isFinite(Date.parse(board.capturedAt))||Date.parse(board.capturedAt)>now||!Number.isFinite(Date.parse(board.lockAt))||Date.parse(board.capturedAt)>=Date.parse(board.lockAt)||now>=Date.parse(board.lockAt))return null;
 const rows=selectNbaCandidates(nbaSlateRows(board.rows,market,day),market,now);
 return rows.length?{success:true,market,boardDay:day,boardCapturedAt:board.capturedAt,boardFrozen:false,refreshing:true,source:'Recent saved pregame NBA board',rows,publicRankingCount:rows.length}:null;
}
