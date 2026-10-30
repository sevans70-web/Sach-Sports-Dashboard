import {cardModelProjection} from '@/lib/saved-model-pick';
import {verifiedPropQuote} from '@/lib/prop-integrity';
/** Display only the original model's exact milestone comparison. This is a
 * forecast against an N+ target, never a fabricated UNDER betting contract. */
export function quarterTargetDisplay(row:any,now=Date.now()){
 if(row?.lineType!=='milestone'||!String(row.market).startsWith('q1_'))return null;
 const forecast=row.researchForecast,target=forecast?.modelTargetForecast,binding=forecast?.quoteEvidence;
 const projection=cardModelProjection(row,now),line=row.sportsbookLine;
 if(projection==null||typeof line!=='number'||!Number.isFinite(line)||line<=0||target?.target!==line||target.quoteId!==row.quoteId)return null;
 const decision=Date.parse(target.calculatedAt||''),start=Date.parse(row.gameTime||''),capture=Date.parse(row.boardCapturedAt||forecast.calculatedAt||'');
 if(!Number.isFinite(decision)||!Number.isFinite(start)||!Number.isFinite(capture)||decision>=start||decision>now||decision>capture||capture>=start||decision!==Date.parse(forecast.calculatedAt)||decision<Date.parse(row.quoteUpdatedAt||''))return null;
 if(!binding||binding.market!==row.market||binding.gameId!==String(row.gameId)||binding.playerId!==String(row.playerId)||binding.quoteId!==row.quoteId||binding.sportsbookKey!==row.sportsbookKey||binding.line!==line||binding.overPrice!==row.overPrice||binding.underPrice!==row.underPrice||Date.parse(binding.calculatedAt)!==decision)return null;
 if(!verifiedPropQuote(row,row.boardFrozen?capture:now,row.boardFrozen===true))return null;
 const direction=projection>=line?'REACHES':'BELOW';if(target.direction!==direction)return null;
 return {direction,label:direction==='REACHES'?`${line}+`:`BELOW ${line}`,projection,target:line};
}
