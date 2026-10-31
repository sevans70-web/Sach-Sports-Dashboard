import {readFileSync} from 'node:fs';import {join} from 'node:path';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {quarterFeatureIndex,quarterPoint,type QuarterModel,type QuarterObservation} from '@/lib/quarter-forecast';
import {forecastInputReceipt} from '@/lib/forecast-input-receipt';
import {verifiedPropQuote} from '@/lib/prop-integrity';
import {refreshQuarterObservations} from '@/lib/live-quarter-observations';
type Bundle={models:QuarterModel[];observations:QuarterObservation[];digest:string;asOf:string};
let cached:Bundle|null=null;
export function quarterRuntimeBundle():Bundle{
 if(cached)return cached;
 const root=join(process.cwd(),'model-runtime'),manifest=JSON.parse(readFileSync(join(root,'quarter-manifest.json'),'utf8')),bytes=readFileSync(join(root,'quarter-snapshot.json.gz'));
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Quarter snapshot checksum mismatch');
 const p=JSON.parse(gunzipSync(bytes).toString());if(p.version!==2||!Array.isArray(p.models)||!Array.isArray(p.rows))throw Error('Invalid quarter snapshot');
 const observations:QuarterObservation[]=p.rows.map((r:any[])=>{const f=p.fixtures[r[0]],a=p.players[r[1]],m=p.markets[r[2]];return {sport:m[0],market:m[1],gameId:f[0],gameTime:f[1],season:f[2],playerId:a[0],teamId:a[1],actual:r[3],role:r[4],starter:r[5]===1,playerName:'',source:`https://site.api.espn.com/apis/site/v2/sports/${m[0]==='nba'?'basketball/nba':'football/nfl'}/summary?event=${f[0]}`,retrievedAt:f[3]}});
 return cached={models:p.models,observations,digest:manifest.sha256,asOf:manifest.asOf};
}
const unavailable=(reason:string)=>({status:'unavailable',projection:null,giScore:null,reason,validatedForBetting:false});
/** A fitted point expectation and its direction are distinct from calibrated
 * win probabilities/EV and the approved betting registry. No price or result
 * enters model features. Milestones never acquire an invented UNDER price. */
export function fittedQuarterForecast(row:any,sport:string,market:string,data:Bundle,now=Date.now(),index=quarterFeatureIndex(data.observations)):any{
 const at=new Date(now).toISOString(),start=Date.parse(row.gameTime),context=row.pregameContext;
 if(row.frozen||row.boardFrozen||row.lockedAtKickoff||['in','post'].includes(row.gameState)||!Number.isFinite(start)||now>=start)return unavailable('pregame_only');
 if(!['nba','nfl'].includes(sport)||!market.startsWith('q1_'))return unavailable('quarter_market_unsupported');
 if(!Number.isFinite(Date.parse(data.asOf))||Date.parse(data.asOf)>now)return unavailable('quarter_snapshot_not_available');
 if(!row.gameId||!row.playerId||!row.teamId||!String(context?.season||row.season||''))return unavailable('missing_fixture_or_team_identity');
 if(context&&(context.gameId!==String(row.gameId)||context.playerId!==String(row.playerId)||context.teamId!==String(row.teamId)||Date.parse(context.gameTime)!==start))return unavailable('wrong_pregame_context_identity');
 if(sport==='nba'&&(!context||context.seasonType!==2||!context.opponentId))return unavailable('missing_exact_pregame_context');
 if(context?.availability?.some((a:any)=>/^(out|inactive|suspended|injured reserve)$/i.test(a.status)))return unavailable('reported_unavailable');
 const group=sport+'|'+market,model=data.models.find(m=>m.group===group);if(!model)return unavailable('quarter_model_unavailable');
 if(Date.parse(model.calibratedThrough)>=now-48*3600000)return unavailable('quarter_model_not_pregame');
 const target={sport,market,season:String(context?.season||row.season),gameId:String(row.gameId),gameTime:row.gameTime,playerId:String(row.playerId),teamId:String(row.teamId)},inputs=index(target,at);
 if(!inputs.features)return unavailable(inputs.reason||'quarter_inputs_unavailable');
 const projection=Math.round(quarterPoint(model,inputs.features)*10)/10;if(!Number.isFinite(projection))return unavailable('invalid_quarter_output');
 const quote=verifiedPropQuote(row,now),line=typeof row.sportsbookLine==='number'&&Number.isFinite(row.sportsbookLine)?row.sportsbookLine:null;
 const side=quote&&row.lineType==='main'&&line!=null?(projection>line?'OVER':projection<line?'UNDER':null):null;
 const residuals=Array.isArray(model.residuals)?model.residuals.filter((r:number)=>typeof r==='number'&&Number.isFinite(r)):[];
 const probability=quote&&row.lineType==='main'&&line!=null&&residuals.length>=100?(()=>{const outcomes=residuals.map((r:number)=>projection+r),over=outcomes.filter((x:number)=>x>line).length,under=outcomes.filter((x:number)=>x<line).length,push=outcomes.length-over-under;return {overProbability:over/outcomes.length,underProbability:under/outcomes.length,pushProbability:push/outcomes.length,probabilityBasis:'held_out_quarter_residuals',probabilitySamples:outcomes.length,validatedForBetting:false}})():null;
 const selection=side?{side,line,price:side==='OVER'?row.overPrice:row.underPrice,sportsbook:row.sportsbook,sportsbookKey:row.sportsbookKey,quoteId:row.quoteId,quoteUpdatedAt:row.quoteUpdatedAt,calculatedAt:at,basis:'fitted_quarter_point_expectation',validatedForBetting:false}:null;
 return {status:'available',projection:Math.round(projection*10)/10,modelId:'direct-quarter-history-ridge-v1',modelGroup:group,calculatedAt:at,trainedThrough:model.trainedThrough,calibratedThrough:model.calibratedThrough,
  latestHistoryAt:inputs.latestHistoryAt,historyGames:inputs.historyGames,historyEvidence:inputs.historyEvidence,snapshotAsOf:data.asOf,snapshotSha256:data.digest,inputReceipt:forecastInputReceipt(group,data.digest,at,inputs.features),
  modelSelection:selection,modelTargetForecast:quote&&row.lineType==='milestone'&&line!=null?{direction:projection>=line?'REACHES':'BELOW',target:line,quoteId:row.quoteId,calculatedAt:at}:null,
  quoteEvidence:quote?{market,gameId:String(row.gameId),playerId:String(row.playerId),quoteId:row.quoteId,sportsbookKey:row.sportsbookKey,line:row.sportsbookLine,overPrice:row.overPrice,underPrice:row.underPrice,calculatedAt:at}:null,
  priceComparison:quote?{...(probability||{}),quoteEvidence:{sport,market,gameId:String(row.gameId),playerId:String(row.playerId),quoteId:row.quoteId,sportsbookKey:row.sportsbookKey,line:row.sportsbookLine,overPrice:row.overPrice,underPrice:row.underPrice,calculatedAt:at}}:null,giScore:null,giReason:'quarter_probability_not_validated',selectionReason:selection?null:row.lineType==='milestone'?'milestone_contract':!quote?'verified_quote_unavailable':'projection_at_line',validatedForBetting:false,reason:null};
}
export async function attachQuarterForecasts(payload:any,sport:'nba'|'nfl',now=Date.now()){
 let data:Bundle;try{data=quarterRuntimeBundle()}catch{return {...payload,rows:payload.rows.map((r:any)=>(r.frozen||r.boardFrozen||r.lockedAtKickoff||['in','post'].includes(r.gameState)||Date.parse(r.gameTime)<=now)?r:({...r,researchForecast:unavailable('quarter_snapshot_unavailable')}))}}
 data={...data,observations:data.observations.filter(g=>g.sport===sport&&g.market===(payload.market||payload.rows[0]?.market))};
 const refresh=await Promise.race([refreshQuarterObservations(payload.rows.filter((r:any)=>verifiedPropQuote(r,now)),sport,now).catch(()=>({observations:[],unavailablePlayers:[]})),new Promise<{observations:QuarterObservation[];unavailablePlayers:string[]}>(resolve=>setTimeout(()=>resolve({observations:[],unavailablePlayers:[]}),2500))]);
 const key=(g:QuarterObservation)=>[g.sport,g.market,g.gameId,g.playerId].join('|'),merged=new Map(data.observations.map(g=>[key(g),g]));for(const g of refresh.observations)if(g.market===(payload.market||payload.rows[0]?.market))merged.set(key(g),g);
 data={...data,observations:[...merged.values()]};const index=quarterFeatureIndex(data.observations),rows=payload.rows.map((r:any)=>(r.frozen||r.boardFrozen||r.lockedAtKickoff||['in','post'].includes(r.gameState)||Date.parse(r.gameTime)<=now)?r:({...r,researchForecast:fittedQuarterForecast(r,sport,payload.market||r.market,data,now,index),forecastCapturedAt:new Date(now).toISOString()}));
 return {...payload,rows,fittedResearchForecastCount:rows.filter((r:any)=>r.researchForecast.status==='available').length,modelSelectionCount:rows.filter((r:any)=>r.researchForecast.modelSelection).length};
}
