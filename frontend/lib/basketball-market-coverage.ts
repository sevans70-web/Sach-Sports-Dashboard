import {basketballMarketMatches} from '@/lib/basketball-markets';
import {mainMarketQuotes} from '@/lib/main-market-quotes';
/** Bounded feed diagnostics: market names and counts, never credentials or player records. */
export function basketballMarketCoverage(payload:any){
 const categories=new Map<string,number>();let props=0;
 for(const game of payload?.data||[])for(const book of game.books||[])for(const prop of book.props||[]){props++;const key=String(prop.category??prop.market??prop.statID??prop.type??'unknown')+'|'+String(prop.periodID??prop.periodId??prop.period??'game');categories.set(key,(categories.get(key)||0)+1)}
 const markets=['q1_points','q1_rebounds','q1_assists','q1_threes_made','q1_pts_rebs_asts','first_basket'];
 const coverage=Object.fromEntries(markets.map(m=>{
  let matched=0;
  for(const g of payload?.data||[])for(const b of g.books||[])matched+=(b.props||[]).filter((p:any)=>basketballMarketMatches(p,m)).length;
  return [m,{matched,priced:mainMarketQuotes(payload,m,p=>basketballMarketMatches(p,m)).length}];
 }));
 return {games:payload?.data?.length||0,props,categories:[...categories].sort(([a],[b])=>a.localeCompare(b)).slice(0,100),markets:coverage};
}
