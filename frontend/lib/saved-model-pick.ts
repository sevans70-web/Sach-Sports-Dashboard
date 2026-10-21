import {verifiedPropQuote} from '@/lib/prop-integrity';
/** A selection must already exist in the saved pregame row. Never infer one from a result. */
export function savedModelPick(row:any,capturedAt=row?.boardCapturedAt){
 const pick=row?.researchForecast?.modelSelection;
 const capture=Date.parse(capturedAt||''),decision=Date.parse(pick?.calculatedAt||''),start=Date.parse(row?.gameTime||'');
 if(!pick||!['OVER','UNDER'].includes(pick.side)||!Number.isFinite(capture)||!Number.isFinite(decision)||!Number.isFinite(start)||capture>=start||decision>capture||decision>=start)return null;
 if(!verifiedPropQuote(row,capture,true)||!pick.quoteId||pick.quoteId!==row.quoteId||pick.sportsbookKey!==row.sportsbookKey||pick.line!==row.sportsbookLine||pick.price!==(pick.side==='OVER'?row.overPrice:row.underPrice))return null;
 return pick;
}
