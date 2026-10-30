import {footballBookRows,footballQuoteFields} from "@/lib/football-book-quotes";

/** Shared exact-quote contract for basketball and hockey. Market matching stays
 * sport-specific; identity, period, freshness and two-sided prices do not. */
export function mainMarketQuotes(payload:any,market:string,matches:(prop:any)=>boolean){
  const data=(Array.isArray(payload?.data)?payload.data:[]).map((game:any)=>({...game,
    books:(Array.isArray(game.books)?game.books:[]).map((book:any)=>({...book,
      props:(Array.isArray(book.props)?book.props:[]).filter(matches).filter((p:any)=>{
        if(market==="first_basket")return true;
        const line=Number(p.line??p.point??p.total);
        // Count-stat markets use whole/half thresholds. An aggregate such as
        // 8.8 points must not masquerade as an executable main-market quote.
        return Number.isFinite(line)&&line>=0&&Number.isInteger(line*2);
      }).map((p:any)=>({...p,sourceCategory:p.category??p.market??p.statID??p.type,sourcePeriod:p.periodID??p.periodId??p.period??p.periodName??"",category:market})),
    })),
  }));
  // FIRST BASKET is a one-sided scorer quote, not an over/under threshold.
  const scorer=market==="first_basket";
  return footballBookRows({data},scorer?"first_td":market,[market]).map(row=>({...row,
    playerTeam:row.teamName.toUpperCase(),bookProbability:row.prob,...footballQuoteFields(row),quoteMarket:market}));
}

export function quoteMatchesFixture(quote:any,game:any,toleranceMs=5*60_000){
  const norm=(v:any)=>String(v||"").normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,"");
  if(!norm(game.awayTeam)||!norm(game.homeTeam)||norm(game.awayTeam)===norm(game.homeTeam))return false;
  const sides=String(quote.matchup||'').split(/\s*@\s*/);
  if(sides.length!==2)return false;
  const names=(primary:string,aliases:unknown)=>[primary,...(Array.isArray(aliases)?aliases.filter(v=>typeof v==='string'):[])].map(norm).filter(Boolean);
  const away=names(game.awayTeam,game.awayTeamAliases),home=names(game.homeTeam,game.homeTeamAliases);
  // Ambiguous identity is never rescued by an alias.
  if(away.some(n=>home.includes(n)))return false;
  const identity=away.includes(norm(sides[0]))&&home.includes(norm(sides[1]));
  const delta=Math.abs(Date.parse(quote.gameTime||"")-Date.parse(game.tipoff||game.date||""));
  return identity&&Number.isFinite(delta)&&delta<=toleranceMs;
}

/** Never attach an executable quote to an arbitrary first/nearest fixture. */
export function uniqueQuoteFixture(quote:any,games:any[],team:string){
 if(!team)return null;
 const matched=games.filter(g=>[g.awayAbbr,g.homeAbbr].some(v=>String(v||'').toUpperCase()===team.toUpperCase())&&quoteMatchesFixture(quote,g));
 const ids=new Set(matched.map(g=>String(g.gameId||g.id||'')));
 return ids.size===1&&!ids.has('')?matched[0]:null;
}

/** Resolve fixtures before deduplicating: another day's quote cannot hide today's. */
export function fixtureQuoteRows(board:any[],games:any[],teamFor:(quote:any)=>string,nameKey:(name:string)=>string){
 const selected=new Map<string,{quote:any;game:any}>();
 for(const quote of board){
  const game=uniqueQuoteFixture(quote,games,teamFor(quote));if(!game)continue;
  const key=nameKey(quote.playerName)+'|'+String(game.gameId||game.id),old=selected.get(key);
  if(!old||Number(quote.bookmakerCount||0)>Number(old.quote.bookmakerCount||0))selected.set(key,{quote,game});
 }
 return [...selected.values()];
}
