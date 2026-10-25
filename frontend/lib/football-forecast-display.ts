import {verifiedPropQuote} from '@/lib/prop-integrity';
import {cardModelPick,cardModelProjection} from '@/lib/saved-model-pick';
/** Display a forecast direction separately from validated betting eligibility.
 * A recovered direction uses only the original pregame projection and line. */
export function footballForecastDisplay(row:any,now=Date.now()){
 const saved=cardModelPick(row,now),f=row?.researchForecast;
 const at=Date.parse(row?.boardCapturedAt||f?.modelSelection?.calculatedAt||row?.capturedAt||'');
 const start=Date.parse(row?.gameTime||'');
 const pregameEvidence=Number.isFinite(at)&&at<start&&at<=now;
 const fitted=cardModelProjection(row,now);
 const baseline=typeof row?.modelProjection==='number'&&Number.isFinite(row.modelProjection)&&row?.researchCohort?.games>=3&&!String(row?.market).startsWith('q1_')?row.modelProjection:null;
 const projection=fitted??(pregameEvidence?baseline:null);
 const line=typeof row?.sportsbookLine==='number'&&Number.isFinite(row.sportsbookLine)?row.sportsbookLine:null;
 const quote=verifiedPropQuote(row,now,row?.boardFrozen===true);
 const side=saved?.side||(projection!=null&&line!=null&&quote&&pregameEvidence&&row.lineType==='main'?(projection>line?'OVER':projection<line?'UNDER':'AT LINE'):null);
 const probability=side==='OVER'?f?.priceComparison?.overProbability:side==='UNDER'?f?.priceComparison?.underProbability:null;
 return {projection,side,basis:fitted!=null?'Model forecast':baseline!=null?'History-based estimate':null,
  probability:typeof probability==='number'&&Number.isFinite(probability)?probability*100:null,
  validated:row?.recommendationEligible===true};
}
export function footballForecastOutcome(side:string|null,actual:number|null,line:number|null){
 if(!['OVER','UNDER'].includes(side||'')||actual==null||line==null||!Number.isFinite(actual)||!Number.isFinite(line))return null;
 return actual===line?'PUSH':side==='OVER'?(actual>line?'HIT':'MISS'):(actual<line?'HIT':'MISS');
}
