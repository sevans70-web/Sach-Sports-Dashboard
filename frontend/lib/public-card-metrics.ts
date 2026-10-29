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
 if(String(row?.market||'').startsWith('q1_'))return verifiedPropQuote(row,now,row.boardFrozen===true)&&row?.withdrawnFromBoard!==true&&row?.resultStatus!=='void';
 return (cardModelPick(row,now)!=null||footballForecastDisplay(row,now).side!=null)&&cardModelProjection(row,now)!=null&&row?.withdrawnFromBoard!==true&&row?.resultStatus!=='void';
}

/** Combined expectations have no joint interval; display only supplied fields. */
export function forecastDetailText(forecast:any,selection:any,format:(value:number)=>string=String){
 const parts=[selection?`${selection.sportsbook} · ${Number(selection.price)>0?'+':''}${selection.price}`:forecast?.modelId==='sum_of_fitted_component_expectations'?'Combined model estimate':'Model estimate'];
 if(typeof forecast?.expectedWorkload==='number'&&Number.isFinite(forecast.expectedWorkload))parts.push(`${format(forecast.expectedWorkload)} expected ${forecast.workloadUnit||'opportunities'}`);
 const range=forecast?.interval80;
 if(typeof range?.lower==='number'&&Number.isFinite(range.lower)&&typeof range?.upper==='number'&&Number.isFinite(range.upper))parts.push(`range ${format(range.lower)}–${format(range.upper)}`);
 return parts.join(' · ')+'.';
}
