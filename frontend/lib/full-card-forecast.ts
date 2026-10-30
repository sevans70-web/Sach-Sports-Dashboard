import {verifiedPropQuote} from '@/lib/prop-integrity';
/** Match the dashboard's original forecast timestamp aliases. Display evidence
 * only: this does not recalculate or authorize a betting selection.
 */
export function recordedCardForecast(row:any,now=Date.now()){
 const f=row?.researchForecast,calculatedAt=f?.calculatedAt||f?.modelSelection?.calculatedAt;
 const capturedAt=row?.boardCapturedAt||row?.featuredSavedAt||row?.capturedAt||calculatedAt;
 const capture=Date.parse(capturedAt||''),calculated=Date.parse(calculatedAt||''),start=Date.parse(row?.gameTime||'');
 if(f?.status!=='available'||typeof f.projection!=='number'||!Number.isFinite(f.projection)||!Number.isFinite(calculated)||!Number.isFinite(capture)||!Number.isFinite(start)||calculated>capture||capture>=start||capture>now)return null;
 if(f.calculatedAt&&f.modelSelection?.calculatedAt&&Date.parse(f.calculatedAt)!==Date.parse(f.modelSelection.calculatedAt))return null;
 if(!verifiedPropQuote({...row,boardCapturedAt:capturedAt},capture,true))return null;
 return {projection:f.projection,line:row.sportsbookLine,playerId:row.playerId,gameId:row.gameId,quoteId:row.quoteId,calculatedAt};
}
