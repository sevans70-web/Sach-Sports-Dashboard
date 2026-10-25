import {footballForecastDisplay} from '@/lib/football-forecast-display';
import {verifiedPropQuote} from '@/lib/prop-integrity';
import {cardModelPick,cardModelProjection} from '@/lib/saved-model-pick';

/** A scorer has a price and a chance, never an O/U threshold. The percentage
 * is explicitly bookmaker-implied; it is not an independently fitted forecast. */
export function firstBasketQuote(row:any,now=Date.now()){
 if(row?.market!=='first_basket'||row.lineType!=='scorer'||!verifiedPropQuote(row,now,row.boardFrozen===true))return null;
 const price=Number(row.overPrice);
 const probability=price>0?100/(price+100):-price/(-price+100);
 return {probability:Math.round(probability*1000)/10,price,sportsbook:String(row.sportsbook),basis:'bookmaker_implied' as const};
}

/** Public cards show supported pregame forecasts or saved selections, labelled separately. Keep the
 * original full board in durable history for audit, including abstentions. */
export function publicNbaRanking(row:any,now=Date.now()){
 if(row?.market==='first_basket')return firstBasketQuote(row,now)!=null;
 return (cardModelPick(row,now)!=null||footballForecastDisplay(row,now).side!=null)&&cardModelProjection(row,now)!=null&&row?.withdrawnFromBoard!==true&&row?.resultStatus!=='void';
}
