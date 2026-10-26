/** A result for another line is not a result for the saved featured decision. */
export function matchingFeaturedResult(row:any,records:any[]){
 const side=String(row.prediction||'').toUpperCase(),line=row.sportsbookLine;
 if(!row.playerId||!row.gameId||!row.market||!side||line==null||!Number.isFinite(Number(line)))return null;
 return records.find(r=>!r.recoveredAfterStart&&!r.withdrawnFromBoard&&String(r.playerId||'')===String(row.playerId)&&String(r.gameId||'')===String(row.gameId)&&r.market===row.market&&String(r.pickSide||r.pick||'').toUpperCase()===side&&r.sportsbookLine!=null&&Number(r.sportsbookLine)===Number(line)&&['hit','miss','push','void'].includes(r.status))||null;
}
export function featuredSelectionDispute(sport:string,day:string,key:string){
 return sport==='nfl'&&day==='2026-10-25'&&key==='long'?'Original Long Shot selection is disputed. This later saved entry is excluded from performance totals until the original pregame selection is authenticated.':null;
}
