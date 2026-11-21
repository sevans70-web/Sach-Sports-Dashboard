import {basketballMarketMatches} from '@/lib/basketball-markets';
const markets=new Set(['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts']);
const allowed=(row:any,keys:string[])=>Object.fromEntries(keys.filter(k=>['string','number','boolean'].includes(typeof row?.[k])).map(k=>[k,row[k]]));
/** Read-only, bounded public evidence. IDs/times/prices are copied only when
 * actually supplied; a missing quote ID is never reconstructed or invented. */
export function nbaFeedSample(payload:any,market='points',limit=2){
 if(!markets.has(market)||!Number.isInteger(limit)||limit<1||limit>25)throw Error('invalid_nba_feed_sample');
 return {sport:'nba',market,limit,scope:'Bounded source sample; not the entire sportsbook population or a prediction. Provider quote IDs, timestamps and prices are preserved when present.',games:(Array.isArray(payload?.data)?payload.data:[]).slice(0,30).map((g:any)=>({
  ...allowed(g,['id','gameId','eventId','homeTeam','awayTeam','home_team','away_team','commenceTime','commence_time','startTime','date']),
  books:(Array.isArray(g.books)?g.books:[]).slice(0,12).map((b:any)=>({...allowed(b,['key','name','lastUpdate']),props:(Array.isArray(b.props)?b.props:[]).filter((p:any)=>basketballMarketMatches(p,market)).slice(0,limit).map((p:any)=>allowed(p,['propId','periodID','periodId','period','periodName','team','teamName','active','isSuspended','isMain','playerName','player','category','line','overPrice','underPrice','lastUpdate','isMainLine','isAlternate','marketStructure','lineType','suspended']))}))
 }))};
}
export function validNbaFeedSample(market:string,limit:number){return markets.has(market)&&Number.isInteger(limit)&&limit>=1&&limit<=25;}
