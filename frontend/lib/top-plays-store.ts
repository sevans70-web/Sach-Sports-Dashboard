import {todayTopPlays} from '@/lib/top-plays';
import {verifiedPropQuote} from '@/lib/prop-integrity';
import {dashboardDay} from '@/lib/dashboard-contract';
const shared=globalThis as typeof globalThis&{__sachTopPlayMarkets?:Map<string,{at:number;rows:any[]}>};
const markets=shared.__sachTopPlayMarkets??=new Map();
/** Reuse the complete market captures already made by the scheduler. Never
 * fan out new paid-provider calls on each dashboard view. */
export function updateTopPlayMarket(sport:string,board:any,now=Date.now()){
 if(!board?.market||!Array.isArray(board.rows))return;
 for(const [key,v] of markets)if(now-v.at>=15*60_000)markets.delete(key);
 const day=board.boardDay||board.day||(board.rows[0]?.gameTime?dashboardDay(board.rows[0].gameTime):dashboardDay(new Date(now)));
 const key=sport+'|'+board.market+'|'+day;if((markets.get(key)?.at||0)>now)return;
 markets.set(key,{at:now,rows:board.rows.map((row:any)=>({...row,market:row.market||board.market}))});
}
export function topPlayMarketState(sport:string,now=Date.now()){
 const sources=[...markets].filter(([key,v])=>key.startsWith(sport+'|')&&now-v.at<15*60_000);
 const rows=sources.flatMap(([,v])=>v.rows);
 return {plays:todayTopPlays(rows,sport,now),marketsChecked:[...new Set(sources.map(([key])=>key.split('|')[1]))],verifiedQuoteCount:rows.filter(r=>verifiedPropQuote(r,now)).length,
  state:sources.length?'ready':'awaiting_market_capture',updatedAt:sources.length?new Date(Math.max(...sources.map(([,v])=>v.at))).toISOString():null};
}
