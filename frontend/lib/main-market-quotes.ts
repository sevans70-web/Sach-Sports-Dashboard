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
  const norm=(v:any)=>String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"");
  const expected=norm(`${game.awayTeam} @ ${game.homeTeam}`);
  const delta=Math.abs(Date.parse(quote.gameTime||"")-Date.parse(game.tipoff||game.date||""));
  return norm(quote.matchup)===expected&&Number.isFinite(delta)&&delta<=toleranceMs;
}
