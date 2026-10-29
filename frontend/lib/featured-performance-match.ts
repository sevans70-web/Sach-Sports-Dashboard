/** A result for another line is not a result for the saved featured decision. */
export function matchingFeaturedResult(row:any,records:any[]){
 const side=String(row.prediction||'').toUpperCase(),line=row.sportsbookLine;
 const firstTd=row.market==='first_td',scorerWithoutLine=firstTd&&line==null;
 if(!row.playerId||!row.gameId||!row.market||!side||(!scorerWithoutLine&&(line==null||!Number.isFinite(Number(line)))))return null;
 return records.find(r=>!r.recoveredAfterStart&&!r.withdrawnFromBoard&&String(r.playerId||'')===String(row.playerId)&&String(r.gameId||'')===String(row.gameId)&&r.market===row.market&&String(r.pickSide||r.pick||'').toUpperCase()===side&&(scorerWithoutLine?(r.sportsbookLine==null&&r.quoteVersion===1&&row.quoteVersion===1&&Boolean(row.sportsbookKey)&&r.sportsbookKey===row.sportsbookKey&&Boolean(row.quoteUpdatedAt)&&r.quoteUpdatedAt===row.quoteUpdatedAt):(r.sportsbookLine!=null&&Number(r.sportsbookLine)===Number(line)))&&(!firstTd||r.resultSource==='verified_first_touchdown_order')&&['hit','miss','push','void'].includes(r.status))||null;
}
export function featuredSelectionDispute(sport:string,day:string,key:string){
 return sport==='nfl'&&day==='2026-10-25'&&key==='long'?'Original Long Shot selection is disputed. This later saved entry is excluded from performance totals until the original pregame selection is authenticated.':null;
}
