import {workerModelRuntime} from "@/lib/worker-model-runtime";
import {attachQuarterForecasts} from '@/lib/live-quarter-forecast';
import {setImmediate as yieldToRequests} from 'node:timers/promises';
import {basketballFeatureIndex} from '@/lib/basketball-model-inputs';
import {predictionProbability} from '@/lib/prediction-probability';
import {estimatedEv} from '@/lib/estimated-ev';
import {refreshNbaObservations,refreshCbbObservations} from '@/lib/live-basketball-observations';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {forecastDistribution,evaluatePrice,quoteProblem,type DistributionModel,type ExactQuote} from '@/lib/probability-forecast';
import {opportunityStrength,type GiArtifact} from '@/lib/opportunity-strength';
import {verifiedPropQuote} from '@/lib/prop-integrity';
import {espnOpportunityGames,nhlOpportunityGames,type OpportunityGame} from '@/lib/opportunity-backtest';
import {providerFetch} from '@/lib/provider-fetch';
import {attachRecordedProgressLines} from '@/lib/recorded-progress';
import {forecastInputReceipt} from '@/lib/forecast-input-receipt';
import {nbaCombinationHistory,NBA_COMBINATION_MARKETS} from '@/lib/nba-combination-history';
import {firstBasketBookOnly} from '@/lib/nba-slate-scope';
import {NHL_COUNT_POLICY,nhlCountMarket,nhlCountDistribution,evaluateNhlCountPrice} from '@/lib/nhl-count-model';
export type RuntimeBundle={models:DistributionModel[];observations:OpportunityGame[];digest:string;asOf:string;gi:Partial<Record<string,GiArtifact>>;giStatus?:Partial<Record<string,{reason:string}>>};
const BASKETBALL_COMBINATIONS:Record<string,string[]>={pts_rebs_asts:['points','rebounds','assists'],pts_rebs:['points','rebounds'],pts_asts:['points','assists'],rebs_asts:['rebounds','assists']};
export function runtimeSupportsMarket(data:Pick<RuntimeBundle,'models'>,sport:string,market:string){
 if(data.models.some(m=>m.group===sport+'|'+market))return true;
 return ['nba','wnba','cbb'].includes(sport)&&!!BASKETBALL_COMBINATIONS[market]&&BASKETBALL_COMBINATIONS[market].every(part=>data.models.some(m=>m.group===sport+'|'+part));
}
export function createRuntimeForecastIndex(observations:OpportunityGame[]){
 const histories=new Map<string,OpportunityGame[]>(),basketball=new Map<string,ReturnType<typeof basketballFeatureIndex>>();
 for(const game of observations){const key=game.sport+'|'+game.market;let rows=histories.get(key);if(!rows){rows=[];histories.set(key,rows)}rows.push(game);}
 return {histories,basketball};
}
let cached:RuntimeBundle|null=null;
const supplementalBundles=new Map<string,RuntimeBundle>();
const supplementalFiles:Record<string,string>={'nhl|goalie_saves':'nhl-goalie-saves.json.gz','nfl|sacks':'nfl-sacks.json.gz','nfl|passing_tds':'nfl-passing-tds.json.gz'};
function bundle(sport:string,market:string):RuntimeBundle|null{
 const worker=workerModelRuntime(sport,market);
 if(worker)return worker;
 if(globalThis.navigator?.userAgent==='Cloudflare-Workers')return null;
 const root=join(process.cwd(),'model-runtime');
 const key=sport+'|'+market,file=supplementalFiles[key];
 if(file){
  const hit=supplementalBundles.get(key);
  if(hit)return hit;
  const bytes=readFileSync(join(root,file));
  const value={...JSON.parse(gunzipSync(bytes).toString()),digest:createHash('sha256').update(bytes).digest('hex'),gi:{},giStatus:{}};
  supplementalBundles.set(key,value);
  return value;
 }
 if(cached)return cached;
 const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
 const bytes=readFileSync(join(root,'snapshot.json.gz'));
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Forecast snapshot checksum mismatch');
 const data=JSON.parse(gunzipSync(bytes).toString());
 if(data.version!==1||!Array.isArray(data.models)||!Array.isArray(data.observations))throw Error('Invalid forecast snapshot');
 let gi={};try{gi=JSON.parse(readFileSync(join(root,'gi-calibration.json'),'utf8'))}catch{}
 let giStatus={};try{giStatus=JSON.parse(readFileSync(join(root,'gi-status.json'),'utf8'))}catch{}
 const combinations=JSON.parse(readFileSync(join(root,'nba-combination-models.json'),'utf8'));
 if(combinations.sourceSha256!==manifest.sha256)throw Error('NBA combination model source mismatch');
 return cached={...data,models:[...data.models,...combinations.models],digest:manifest.sha256,asOf:manifest.asOf,gi,giStatus};
}
const unavailable=(reason:string)=>({status:'unavailable',projection:null,giScore:null,reason,validatedForBetting:false});
/** Experimental outputs remain separate from the validated recommendation
 * registry and never rewrite historical lines, bets, grades or probabilities. */
export function fittedResearchForecast(row:any,sport:string,market:string,data:RuntimeBundle,now=Date.now(),index?:ReturnType<typeof createRuntimeForecastIndex>):any{
 if(row?.frozen||row?.lockedAtKickoff||['in','post'].includes(row?.gameState)||!Number.isFinite(Date.parse(row?.gameTime))||Date.parse(row.gameTime)<=now)return unavailable('pregame_only');
 const context=row.pregameContext;
 if(context&&(context.gameId!==String(row.gameId)||context.playerId!==String(row.playerId)||context.teamId!==String(row.teamId)||Date.parse(context.gameTime)!==Date.parse(row.gameTime)))return unavailable('wrong_pregame_context_identity');
 if(!row?.gameId||!row?.playerId||!row?.teamId||!(context?.season||row?.season))return unavailable('missing_fixture_or_team_identity');
 if(!Number.isFinite(Date.parse(data.asOf))||Date.parse(data.asOf)>now)return unavailable('snapshot_not_available');
 const combination=BASKETBALL_COMBINATIONS;
 const directCombination=sport==='nba'&&Boolean(combination[market])&&data.models.some(m=>m.group===sport+'|'+market);
 if(['nba','wnba','cbb'].includes(sport)&&combination[market]&&!directCombination){
  const parts=combination[market].map(component=>fittedResearchForecast({...row,market:component,sportsbookLine:null},sport,component,data,now,index));
  if(parts.some(p=>p.status!=='available'||p.projection==null))return unavailable('component_forecast_unavailable');
  return {status:'available',projection:Math.round(parts.reduce((n,p)=>n+Number(p.projection),0)*10)/10,modelId:'sum_of_fitted_component_expectations',modelGroup:sport+'|'+market,calculatedAt:new Date(now).toISOString(),components:combination[market],componentInputReceipts:parts.map(p=>p.inputReceipt),giScore:null,giReason:'GI_exact_price_calibration_missing',priceComparison:null,modelSelection:null,validatedForBetting:false,reason:null};
 }
 const key=sport+'|'+market,model=data.models.find(m=>m.group===key);
 if(!model)return unavailable('market_model_not_fitted');
 if(model.featurePolicy==='basketball_context'&&(!context||context.gameId!==String(row.gameId)||context.playerId!==String(row.playerId)||context.teamId!==String(row.teamId)||Date.parse(context.gameTime)!==Date.parse(row.gameTime)||!context.opponentId||!['home','away'].includes(context.homeAway)))return unavailable('missing_exact_pregame_context');
 if(model.featurePolicy==='basketball_context'&&context?.seasonType!=null&&context.seasonType!==2)return unavailable('model_requires_regular_season');
 if(context?.availability?.some((r:any)=>/^(out|inactive|suspended|injured reserve)$/i.test(r.status)))return unavailable('reported_unavailable');
 const target={sport,market,gameId:String(row.gameId),playerId:String(row.playerId),playerName:String(row.playerName||''),teamId:String(row.teamId),
  opponentId:String(context?.opponentId||row.opponentId||''),season:String(context?.season||row.season),gameTime:row.gameTime,source:'current official fixture',retrievedAt:new Date(now).toISOString(),
  ...(model.featurePolicy==='basketball_context'?{basketballContext:{home:context.homeAway==='home'} as OpportunityGame['basketballContext']}:{}),
 };
 const history=index?.histories.get(key)||data.observations.filter(g=>g.sport===sport&&g.market===market);
 const latest=history.filter(g=>g.playerId===target.playerId&&g.teamId===target.teamId&&Date.parse(g.gameTime)<now-48*3600000).sort((a,b)=>a.gameTime.localeCompare(b.gameTime)).at(-1);
 if(!latest)return unavailable('player_team_history_unavailable');
 let prepared=index?.basketball.get(key);
 if(index&&model.featurePolicy==='basketball_context'&&!prepared){prepared=basketballFeatureIndex(history);index.basketball.set(key,prepared);}
 const result=forecastDistribution(model,history,target,new Date(now).toISOString(),prepared);
 if(!result.forecast)return unavailable(result.reason||'forecast_inputs_unavailable');
 const f=result.forecast,countMarket=nhlCountMarket(sport,market);
 if(!Number.isFinite(f.projection)||!Number.isFinite(f.expectedWorkload))return unavailable('invalid_fitted_output');
 if(countMarket&&(f.projection<0||f.projection>100))return unavailable('invalid_fitted_output');
 const values=countMarket?nhlCountDistribution(f.projection).values:[...f.values].sort((a,b)=>a-b);
 if(!values.length||!values.every(Number.isFinite))return unavailable('invalid_fitted_output');
 let pricing:any=null,gi:any=null;
 if(verifiedPropQuote(row,now)&&row.lineType==='main'){
  const quote:ExactQuote={sport,market,period:market.startsWith('q1_')?'q1':'game',gameId:target.gameId,playerId:target.playerId,bookmaker:row.sportsbookKey,quoteId:row.quoteId,line:row.sportsbookLine,overPrice:row.overPrice,underPrice:row.underPrice,updatedAt:row.quoteUpdatedAt,capturedAt:row.capturedAt||new Date(now).toISOString(),decisionAt:new Date(now).toISOString(),mainLine:true};
  if(!quoteProblem(quote,target)){
   pricing=countMarket?evaluateNhlCountPrice(f.projection,quote):evaluatePrice(values,quote);
   // Existing GI artifacts evaluated the old residual likelihood and 55%
   // selection policy. They cannot certify a different count distribution.
   const artifact=data.gi[key];if(!countMarket&&artifact&&data.giStatus?.[key]?.reason!=='price_validation_failed')gi=opportunityStrength(artifact,Math.max(pricing.overEv,pricing.underEv),quote.decisionAt);
  }
 }
 // A directional model selection does not require a GI return-ranking fit.
 // Keep it distinct from the approved recommendation registry and its grades.
 // A market that already failed exact-price evaluation remains withheld.
 // CW08's archived-season regression does not approve the count candidate.
 // Keep its diagnostics available, but emit no new selections until count
 // accuracy and exact-price validation pass. Frozen saved forecasts bypass
 // this function in attachFittedResearchForecasts and are never rewritten.
 const selectionSide=countMarket||data.giStatus?.[key]?.reason==='price_validation_failed'?null:pricing?.candidateSide;
 const modelSelection=selectionSide?{
  side:selectionSide as 'OVER'|'UNDER',line:row.sportsbookLine,
  price:selectionSide==='OVER'?row.overPrice:row.underPrice,
  sportsbook:row.sportsbook,sportsbookKey:row.sportsbookKey,quoteId:row.quoteId,
  quoteUpdatedAt:row.quoteUpdatedAt,calculatedAt:new Date(now).toISOString(),
  basis:'fitted_distribution_and_exact_quote',validatedForBetting:false,
 }:null;
 return {status:'available',projection:Math.round(f.projection*10)/10,expectedWorkload:Math.round(f.expectedWorkload*10)/10,
  workloadUnit:market==='sacks'?'defensive snaps':['nba','wnba','cbb'].includes(sport)?'minutes':['passing_yards','passing_tds'].includes(market)?'pass attempts':market==='rushing_yards'?'carries':sport==='nhl'?'minutes':'targets',
  interval80:{lower:Math.round(values[Math.floor((values.length-1)*.1)]*10)/10,upper:Math.round(values[Math.floor((values.length-1)*.9)]*10)/10},
  modelId:countMarket?NHL_COUNT_POLICY:model.featurePolicy==='basketball_context'?'basketball-context-distribution-candidate-v1':'workload-distribution-candidate-v2',modelGroup:key,
  ...(countMarket?{countModelValidation:{selectionApproved:false,reason:'nhl_count_revalidation_required',pointModel:'existing_workload_rate',probabilityModel:'poisson',distributionSamples:1001}}:{}),
  trainedThrough:model.trainedThrough,calibratedThrough:model.calibratedThrough,latestHistoryAt:latest.gameTime,calculatedAt:new Date(now).toISOString(),snapshotAsOf:data.asOf,snapshotSha256:data.digest,
  inputReceipt:forecastInputReceipt(key,data.digest,new Date(now).toISOString(),f.inputFeatures),
  giScore:gi?.score??null,giEstimatedUnitReturn:gi?.estimatedUnitReturn??null,giReason:countMarket?'price_validation_failed':gi?.reason||data.giStatus?.[key]?.reason||(!pricing?'verified_quote_unavailable':'GI_exact_price_calibration_missing'),
  candidateSide:selectionSide&&gi?.score>0&&gi?.estimatedUnitReturn!=null&&gi.estimatedUnitReturn>=.03?selectionSide:null,
  modelSelection,
  selectionReason:countMarket?'price_validation_failed':modelSelection?null:data.giStatus?.[key]?.reason==='price_validation_failed'?'price_validation_failed':!pricing?'verified_quote_unavailable':'price_threshold_not_met',
  // Comparison and probabilities are research calculations, never a pick.
  priceComparison:pricing?{quoteEvidence:{sport,market,gameId:String(row.gameId),playerId:String(row.playerId),quoteId:row.quoteId,sportsbookKey:row.sportsbookKey,line:row.sportsbookLine,overPrice:row.overPrice,underPrice:row.underPrice,calculatedAt:new Date(now).toISOString()},overProbability:pricing.over,underProbability:pricing.under,pushProbability:pricing.push,overExpectedReturn:pricing.overEv,underExpectedReturn:pricing.underEv}:null,
  validatedForBetting:false,reason:null,
 };
}
export async function attachFittedResearchForecasts(payload:any,sport:string,now=Date.now(),options:{offlineOnly?:boolean}={}){
 if(!Array.isArray(payload?.rows)||!payload.rows.length)return payload;
 // First Basket is a ONE-SIDED scorer-odds market, not a fitted OVER/UNDER
 // distribution. Preserve the verified book quote and book-implied chance,
 // but do not run or claim the general player-stat forecast against it.
 if(sport==='nba'&&String(payload.market||payload.rows[0]?.market||'')==='first_basket'){
  return {...payload,rows:payload.rows.map(firstBasketBookOnly)};
 }
 if(!options.offlineOnly)payload=await attachRecordedProgressLines(payload,sport,now);
 if(['nba','nfl'].includes(sport)&&String(payload.market||payload.rows[0]?.market||'').startsWith('q1_'))return attachQuarterForecasts(payload,sport as 'nba'|'nfl',now);
 let data:RuntimeBundle|null;try{data=bundle(sport,String(payload.market||payload.rows[0]?.market||""))}catch(e){console.error('[forecast runtime]',e instanceof Error?e.message:'unavailable');return {...payload,rows:payload.rows.map((r:any)=>(sport==='nhl'&&r.boardFrozen&&r.researchForecast?r:{...r,researchForecast:unavailable('model_snapshot_unavailable')}))}}
 if(!data)return {...payload,rows:payload.rows.map((r:any)=>(sport==='nhl'&&r.boardFrozen&&r.researchForecast?r:{...r,researchForecast:unavailable('market_model_not_fitted')})),
  forecastBlockers:{market_model_not_fitted:payload.rows.length},fittedResearchForecastCount:0,modelSelectionCount:0};
 // Reuse the same official gamelog URL/cache as the rankings route. Historical
 // team IDs come from each event, so a transfer cannot inherit another team's role.
 if((sport==='nfl'||sport==='nhl')&&payload.market!=='sacks'){
  const pricedGoalies=sport==='nhl'&&payload.market==='goalie_saves';
  const players=[...new Map<string,any>(payload.rows.filter((r:any)=>(!pricedGoalies||verifiedPropQuote(r,now))&&/^\d+$/.test(String(r.playerId))&&Date.parse(r.gameTime)>now&&!r.frozen&&!r.lockedAtKickoff).map((r:any)=>[String(r.playerId),r])).values()];
  const updates:OpportunityGame[]=[];
  for(let i=0;i<players.length;i+=4)await Promise.all(players.slice(i,i+4).map(async row=>{
   const season=String(row.season),url=sport==='nhl'?`https://api-web.nhle.com/v1/player/${encodeURIComponent(row.playerId)}/game-log/${encodeURIComponent(season)}/2`:`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${encodeURIComponent(row.playerId)}/gamelog?season=${encodeURIComponent(season)}`;
   try{const r=await providerFetch(url);if(!r.ok)return;const identity={sport,season,playerId:String(row.playerId),playerName:row.playerName,source:url,retrievedAt:new Date(now).toISOString()};const payload=await r.json();updates.push(...(sport==='nhl'?nhlOpportunityGames(payload,identity):espnOpportunityGames(payload,identity)))}catch{}
  }));
  if(updates.length){const merged=new Map(data.observations.map(r=>[[r.sport,r.market,r.playerId,r.gameId].join('|'),r]));for(const r of updates)merged.set([r.sport,r.market,r.playerId,r.gameId].join('|'),r);data={...data,observations:[...merged.values()]}}
 }
 let basketballRefreshUnavailable=new Set<string>();
 if(!options.offlineOnly&&['nba','cbb'].includes(sport)&&runtimeSupportsMarket(data,sport,String(payload.market||payload.rows[0]?.market||''))){
  const refresh=sport==='cbb'
   ?await refreshCbbObservations(payload.rows,now)
   :await refreshNbaObservations(payload.rows.filter((r:any)=>verifiedPropQuote(r,now)),now);
  basketballRefreshUnavailable=new Set(refresh.unavailablePlayers);
  const merged=new Map(data.observations.map(r=>[[r.sport,r.market,r.playerId,r.gameId].join('|'),r]));
  for(const r of refresh.observations)merged.set([r.sport,r.market,r.playerId,r.gameId].join('|'),r);
  data={...data,observations:[...merged.values()]};
 }
 const market=String(payload.market||payload.rows[0]?.market||'');
 if(sport==='nba'&&NBA_COMBINATION_MARKETS[market]&&data.models.some(model=>model.group===sport+'|'+market)){
  data={...data,observations:nbaCombinationHistory(data.observations,market)};
 }
 const index=createRuntimeForecastIndex(data.observations),rows:any[]=[];
 for(const r of payload.rows){
  const row={...r,researchForecast:sport==='nhl'&&r.boardFrozen&&r.researchForecast?r.researchForecast:basketballRefreshUnavailable.has(String(r.playerId))?unavailable('recent_official_history_unavailable'):fittedResearchForecast(r,sport,String(payload.market||r.market||''),data,now,index)};
  // Record the actual pregame decision/capture timestamp when a freshly fitted
  // selection is paired with a currently verified sportsbook quote. Without
  // this receipt estimatedEv rejects otherwise valid priced forecasts.
  // Never stamp a historical, frozen, stale, or model-only candidate.
  const selection=row.researchForecast?.modelSelection;
  const decision=Date.parse(selection?.calculatedAt||'');
  const kickoff=Date.parse(row.gameTime||'');
  const eligibleReceipt=selection&&Number.isFinite(decision)&&decision<=Date.now()&&
   Number.isFinite(kickoff)&&decision<kickoff&&verifiedPropQuote(row,now)&&
   row.researchForecast?.priceComparison?.quoteEvidence&&
   !row.boardFrozen&&!row.frozen&&!row.lockedAtKickoff;
  const priced=eligibleReceipt?{
   ...row,
   forecastCapturedAt:new Date(decision).toISOString(),
   boardCapturedAt:row.boardCapturedAt||new Date(decision).toISOString(),
  }:row;
  rows.push({...priced,estimatedEv:estimatedEv(priced,now),pregameProbability:predictionProbability(priced,now)});
  // Even a large slate must let health/history requests run between players.
  await yieldToRequests();
 }
 const forecastBlockers:Record<string,number>={};
 for(const row of rows){const reason=row.researchForecast?.status==='available'?(row.researchForecast.modelSelection?'selected':row.researchForecast.selectionReason||'forecast_without_selection'):row.researchForecast?.reason||'unknown';forecastBlockers[reason]=(forecastBlockers[reason]||0)+1;}
 if(String(payload.market||'').startsWith('q1_'))console.info('[N05 forecast audit]',JSON.stringify({sport,market:payload.market,rows:rows.length,modelAvailable:runtimeSupportsMarket(data,sport,String(payload.market||'')),blockers:forecastBlockers}));
 if(sport==='nhl'||sport==='cbb')console.info('[P01 coverage audit]',JSON.stringify({sport,market:payload.market||payload.rows[0]?.market||'',rows:rows.length,verifiedQuotes:rows.filter((r:any)=>verifiedPropQuote(r,now)).length,modelAvailable:runtimeSupportsMarket(data,sport,String(payload.market||payload.rows[0]?.market||'')),fittedForecasts:rows.filter((r:any)=>r.researchForecast.status==='available').length,blockers:forecastBlockers}));
 return {...payload,rows,forecastBlockers,pricedForecastCandidates:rows.filter((r:any)=>verifiedPropQuote(r,now)).length,fittedResearchForecastCount:rows.filter((r:any)=>r.researchForecast.status==='available').length,
  modelSelectionCount:rows.filter((r:any)=>r.researchForecast.modelSelection!=null).length};
}
