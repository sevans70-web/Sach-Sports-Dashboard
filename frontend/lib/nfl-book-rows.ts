import {footballBookRows} from '@/lib/football-book-quotes';
/** NFL-only aliases keep the research Worker's shared parser unchanged.
 * Explicit quarter categories establish period only without contradictory
 * metadata. Source categories, prices and original payloads remain intact. */
export function nflBookRows(payload:any,market:string,aliases:string[],now=Date.now()){
 let source=payload;
 if(market==='q1_anytime_td'){
  const data=(payload?.data||[]).map((game:any)=>{
   const books=(game.books||[]).map((book:any)=>{
    const props=(book.props||[]).map((prop:any)=>{
     const category=String(prop.category??prop.market??prop.type??'').toLowerCase().replace(/[^a-z0-9]/g,'');
     const period=[prop.periodID,prop.periodId,prop.period,prop.periodName].some(v=>String(v??'').trim());
     return category==='touchdowns1q'&&!period?{...prop,periodID:'q1',sourcePeriod:'explicit_category:touchdowns_1q'}:prop;
    });
    return {...book,props};
   });
   return {...game,books};
  });
  source={...payload,data};
 }
 const parsingMarket=market==='q1_qb_rushing_yards'?'q1_rushing_yards':market;
 return footballBookRows(source,parsingMarket,aliases,now,market.startsWith('q1_')).map(row=>parsingMarket===market?row:{...row,quoteMarket:market});
}
