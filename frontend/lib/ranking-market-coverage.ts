import {nbaEvMarket,nbaRankingEv} from '@/lib/nba-ranking-ev';
import {rankingRowIsPick} from '@/lib/ranking-pick-count';
import {dashboardDay} from '@/lib/dashboard-contract';
import {estimatedEv} from '@/lib/estimated-ev';
import {excludeUnavailableRanking} from '@/lib/ranking-availability';
import {capRankingUnders,cardModelPick,cardModelProjection} from '@/lib/saved-model-pick';
import {completeRankingProp,firstBasketQuote} from '@/lib/public-card-metrics';
import {verifiedPropQuote} from '@/lib/prop-integrity';

type MarketCount = {gameId:string;rows:number;lines:number;projections:number;picks:number;ev:number};
type MarketCoverage = {day:string;market:string;checkedAt:number;games:MarketCount[]};
type CoverageCache = {
 get(key:string,type:'json'):Promise<unknown>;
 put(key:string,value:string,options:{expirationTtl:number}):Promise<void>;
};
const cacheKey=(sport:string,day:string,market:string)=>`sach:ranking-coverage:v3:${sport}:${day}:${market}`;

export function rankingMarketCoverage(sport:string,market:string,day:string,rows:any[],now=Date.now()):MarketCoverage{
 const matches=new Map<string,any>();
 for(const row of rows){
  if(!row.gameId||!row.playerId||row.market&&row.market!==market||dashboardDay(row.gameTime)!==day||
    row.withdrawnFromBoard===true||row.resultStatus==='void'||excludeUnavailableRanking(row,now))continue;
  matches.set(`${row.gameId}|${row.playerId}`,{...row,market,sport});
 }
 // Match the public card filter before claiming that a market has rankings.
 // A raw sportsbook quote is not a visible ranking without a complete forecast.
 const ranked=[...matches.values()].map((raw,index)=>({raw,rank:index+1,playerId:String(raw.playerId)}));
 const eligible=ranked.flatMap(card=>{
  const forecast=sport==='nba'&&nbaEvMarket(market)?{side:null,percent:0}:sport==='nba'&&market==='first_basket'?firstBasketQuote(card.raw,now)&&{side:null,percent:0}:completeRankingProp(card.raw,now);
  return forecast?[{...card,forecast}]:[];
 });
 const frozen=eligible.filter(card=>card.raw.boardFrozen||card.raw.frozen||card.raw.lockedAtKickoff);
 const upcoming=eligible.filter(card=>!frozen.includes(card));
 const sorted=sport==='nba'&&!nbaEvMarket(market)&&market!=='first_basket'?[...upcoming].sort((a,b)=>b.forecast.percent-a.forecast.percent||a.rank-b.rank):upcoming;
 const visible=sport==='nhl'||sport==='nba'&&(nbaEvMarket(market)||market==='first_basket')?sorted:capRankingUnders(sorted,card=>sport==='nba'
  ?card.forecast.percent>0?card.forecast.side:null
  :cardModelPick(card.raw,now)?.side||card.forecast.side);
 const displayed=new Set([...frozen,...visible].map(card=>card.raw));
 const games=new Map<string,MarketCount>();
 for(const {raw} of ranked){
  const gameId=String(raw.gameId),game=games.get(gameId)||{gameId,rows:0,lines:0,projections:0,picks:0,ev:0};
  const ev=sport==='nba'&&nbaEvMarket(market)?nbaRankingEv(raw,now):estimatedEv(raw,now);
  if(displayed.has(raw))game.rows++;
  if(verifiedPropQuote(raw,now,raw.boardFrozen===true))game.lines++;
  if(cardModelProjection(raw,now)!=null)game.projections++;
  if(displayed.has(raw)){
   if(ev.status==='available'&&Number.isFinite(ev.percent))game.ev++;
   if(rankingRowIsPick(raw,now))game.picks++;
  }
  games.set(gameId,game);
 }
 return {day,market,checkedAt:now,games:[...games.values()]};
}

export async function recordRankingMarket(cache:CoverageCache|undefined,sport:string,market:string,payload:any,now=Date.now()){
 if(!cache||payload?.success!==true||!Array.isArray(payload.rows)||payload.market!==market)return;
 const days=new Set<string>([payload.boardDay||dashboardDay(new Date(now)),...payload.rows.map((r:any)=>dashboardDay(r.gameTime)).filter(Boolean)]);
 for(const day of days){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))continue;
  const coverage=rankingMarketCoverage(sport,market,day,payload.rows,now);
  const key=cacheKey(sport,day,market);
  const previous=await cache.get(key,'json') as MarketCoverage|null;
  if(previous&&previous.checkedAt>=coverage.checkedAt)continue;
  await cache.put(key,JSON.stringify(coverage),{expirationTtl:2*86400});
 }
}

export async function readRankingMarketCoverage(binding:unknown,sport:string,day:string,markets:string[],now=Date.now()){
 const cache=binding as Partial<CoverageCache>|undefined;
 if(!cache||typeof cache.get!=='function')return [];
 const read=cache.get.bind(cache);
 const reads=await Promise.allSettled(markets.map(market=>read(cacheKey(sport,day,market),'json')));
 return reads.flatMap((result,index)=>{
  const value=result.status==='fulfilled'?result.value as MarketCoverage|null:null;
  return value?.day===day&&value.market===markets[index]&&Number.isFinite(value.checkedAt)&&value.checkedAt<=now&&now-value.checkedAt<15*60_000&&Array.isArray(value.games)?[value]:[];
 });
}
