import {dashboardDay} from '@/lib/dashboard-contract';
import {footballForecastDisplay} from '@/lib/football-forecast-display';
import {estimatedEv} from '@/lib/estimated-ev';
import {nbaCardEv,rankNbaCardsByEv} from '@/lib/nba-ev-ranking';
import {excludeUnavailableRanking} from '@/lib/ranking-availability';
import {capRankingUnders,cardModelPick,cardModelProjection} from '@/lib/saved-model-pick';
import {verifiedPropQuote} from '@/lib/prop-integrity';

type MarketCount = {gameId:string;rows:number;lines:number;projections:number;picks:number;ev:number};
type MarketCoverage = {day:string;market:string;checkedAt:number;games:MarketCount[]};
type CoverageCache = {
 get(key:string,type:'json'):Promise<unknown>;
 put(key:string,value:string,options:{expirationTtl:number}):Promise<void>;
};
const cacheKey=(sport:string,day:string,market:string)=>`sach:ranking-coverage:v1:${sport}:${day}:${market}`;

export function rankingMarketCoverage(sport:string,market:string,day:string,rows:any[],now=Date.now()):MarketCoverage{
 const matches=new Map<string,any>();
 for(const row of rows){
  if(!row.gameId||!row.playerId||row.market&&row.market!==market||dashboardDay(row.gameTime)!==day||
    row.withdrawnFromBoard===true||row.resultStatus==='void'||excludeUnavailableRanking(row,now))continue;
  matches.set(`${row.gameId}|${row.playerId}`,{...row,market,sport});
 }
 const ranked=[...matches.values()].map((raw,index)=>({raw,rank:index+1,playerId:String(raw.playerId)}));
 const frozen=ranked.filter(({raw})=>raw.boardFrozen||raw.frozen||raw.lockedAtKickoff);
 const upcoming=ranked.filter(card=>!frozen.includes(card));
 const cards=sport==='nba'?capRankingUnders(rankNbaCardsByEv(ranked,now),card=>nbaCardEv(card,now)?.side??null):
  [...frozen,...capRankingUnders(upcoming,({raw})=>cardModelPick(raw,now)?.side||(sport==='nfl'?footballForecastDisplay(raw,now).side:null))];
 const displayed=new Set(cards.map(card=>card.raw));
 const games=new Map<string,MarketCount>();
 for(const {raw} of ranked){
  const gameId=String(raw.gameId),game=games.get(gameId)||{gameId,rows:0,lines:0,projections:0,picks:0,ev:0};
  const ev=estimatedEv(raw,now),pick=cardModelPick(raw,now);
  game.rows++;
  if(verifiedPropQuote(raw,now,raw.boardFrozen===true))game.lines++;
  if(cardModelProjection(raw,now)!=null)game.projections++;
  if(displayed.has(raw)){
   if(ev.status==='available'||sport==='nba'&&nbaCardEv({raw},now)!=null)game.ev++;
   if(pick&&(sport==='nhl'||ev.status==='available'&&ev.percent>0))game.picks++;
  }
  games.set(gameId,game);
 }
 return {day,market,checkedAt:now,games:[...games.values()]};
}

export async function recordRankingMarket(cache:CoverageCache|undefined,sport:string,market:string,payload:any,now=Date.now()){
 if(!cache||payload?.success!==true||!Array.isArray(payload.rows)||payload.market!==market)return;
 const day=dashboardDay(new Date(now));
 const coverage=rankingMarketCoverage(sport,market,day,payload.rows,now);
 const key=cacheKey(sport,day,market);
 const previous=await cache.get(key,'json') as MarketCoverage|null;
 if(previous&&previous.checkedAt>=coverage.checkedAt)return;
 await cache.put(key,JSON.stringify(coverage),{expirationTtl:2*86400});
}

export async function readRankingMarketCoverage(binding:unknown,sport:string,day:string,markets:string[]){
 const cache=binding as Partial<CoverageCache>|undefined;
 if(!cache||typeof cache.get!=='function')return [];
 const read=cache.get.bind(cache);
 const reads=await Promise.allSettled(markets.map(market=>read(cacheKey(sport,day,market),'json')));
 return reads.flatMap((result,index)=>{
  const value=result.status==='fulfilled'?result.value as MarketCoverage|null:null;
  return value?.day===day&&value.market===markets[index]&&Array.isArray(value.games)?[value]:[];
 });
}
