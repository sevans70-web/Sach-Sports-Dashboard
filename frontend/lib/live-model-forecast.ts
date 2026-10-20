import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {forecastDistribution,evaluatePrice,quoteProblem,type DistributionModel,type ExactQuote} from '@/lib/probability-forecast';
import {opportunityStrength,type GiArtifact} from '@/lib/opportunity-strength';
import {verifiedPropQuote} from '@/lib/prop-integrity';
import {espnOpportunityGames,nhlOpportunityGames,type OpportunityGame} from '@/lib/opportunity-backtest';
import {providerFetch} from '@/lib/provider-fetch';
export type RuntimeBundle={models:DistributionModel[];observations:OpportunityGame[];digest:string;asOf:string;gi:Partial<Record<string,GiArtifact>>;giStatus?:Partial<Record<string,{reason:string}>>};
let cached:RuntimeBundle|null=null;
function bundle():RuntimeBundle{
 if(cached)return cached;
 const root=join(process.cwd(),'model-runtime'),manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
 const bytes=readFileSync(join(root,'snapshot.json.gz'));
 if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw Error('Forecast snapshot checksum mismatch');
 const data=JSON.parse(gunzipSync(bytes).toString());
 if(data.version!==1||!Array.isArray(data.models)||!Array.isArray(data.observations))throw Error('Invalid forecast snapshot');
 let gi={};try{gi=JSON.parse(readFileSync(join(root,'gi-calibration.json'),'utf8'))}catch{}
 let giStatus={};try{giStatus=JSON.parse(readFileSync(join(root,'gi-status.json'),'utf8'))}catch{}
 return cached={...data,digest:manifest.sha256,asOf:manifest.asOf,gi,giStatus};
}
const unavailable=(reason:string)=>({status:'unavailable',projection:null,giScore:null,reason,validatedForBetting:false});
/** Experimental outputs remain separate from the validated recommendation
 * registry and never rewrite historical lines, bets, grades or probabilities. */
export function fittedResearchForecast(row:any,sport:string,market:string,data:RuntimeBundle,now=Date.now()){
 if(row?.frozen||row?.lockedAtKickoff||['in','post'].includes(row?.gameState)||!Number.isFinite(Date.parse(row?.gameTime))||Date.parse(row.gameTime)<=now)return unavailable('pregame_only');
 const context=row.pregameContext;
 if(context&&(context.gameId!==String(row.gameId)||context.playerId!==String(row.playerId)||context.teamId!==String(row.teamId)||Date.parse(context.gameTime)!==Date.parse(row.gameTime)))return unavailable('wrong_pregame_context_identity');
 if(!row?.gameId||!row?.playerId||!row?.teamId||!(context?.season||row?.season))return unavailable('missing_fixture_or_team_identity');
 if(!Number.isFinite(Date.parse(data.asOf))||Date.parse(data.asOf)>now)return unavailable('snapshot_not_available');
 const key=sport+'|'+market,model=data.models.find(m=>m.group===key);
 if(!model)return unavailable('market_model_not_fitted');
 if(model.featurePolicy==='basketball_context'&&(!context||context.gameId!==String(row.gameId)||context.playerId!==String(row.playerId)||context.teamId!==String(row.teamId)||Date.parse(context.gameTime)!==Date.parse(row.gameTime)||!context.opponentId||!['home','away'].includes(context.homeAway)))return unavailable('missing_exact_pregame_context');
 if(context?.seasonType!=null&&context.seasonType!==2)return unavailable('model_requires_regular_season');
 if(context?.availability?.some((r:any)=>/^(out|inactive|suspended|injured reserve)$/i.test(r.status)))return unavailable('reported_unavailable');
 const target={sport,market,gameId:String(row.gameId),playerId:String(row.playerId),playerName:String(row.playerName||''),teamId:String(row.teamId),
  opponentId:String(context?.opponentId||row.opponentId||''),season:String(context?.season||row.season),gameTime:row.gameTime,source:'current official fixture',retrievedAt:new Date(now).toISOString(),
  ...(model.featurePolicy==='basketball_context'?{basketballContext:{home:context.homeAway==='home'} as OpportunityGame['basketballContext']}:{}),
 };
 const history=data.observations.filter(g=>g.sport===sport&&g.market===market);
 const latest=history.filter(g=>g.playerId===target.playerId&&g.teamId===target.teamId&&Date.parse(g.gameTime)<now-48*3600000).sort((a,b)=>a.gameTime.localeCompare(b.gameTime)).at(-1);
 if(!latest)return unavailable('player_team_history_unavailable');
 const result=forecastDistribution(model,history,target,new Date(now).toISOString());
 if(!result.forecast)return unavailable(result.reason||'forecast_inputs_unavailable');
 const f=result.forecast,values=[...f.values].sort((a,b)=>a-b);
 if(!Number.isFinite(f.projection)||!Number.isFinite(f.expectedWorkload)||!values.length||!values.every(Number.isFinite))return unavailable('invalid_fitted_output');
 let pricing:any=null,gi:any=null;
 if(verifiedPropQuote(row,now)&&row.lineType==='main'){
  const quote:ExactQuote={sport,market,period:market.startsWith('q1_')?'q1':'game',gameId:target.gameId,playerId:target.playerId,bookmaker:row.sportsbookKey,quoteId:row.quoteId,line:row.sportsbookLine,overPrice:row.overPrice,underPrice:row.underPrice,updatedAt:row.quoteUpdatedAt,capturedAt:row.capturedAt||new Date(now).toISOString(),decisionAt:new Date(now).toISOString(),mainLine:true};
  if(!quoteProblem(quote,target)){
   pricing=evaluatePrice(values,quote);
   const artifact=data.gi[key];if(artifact)gi=opportunityStrength(artifact,Math.max(pricing.overEv,pricing.underEv),quote.decisionAt);
  }
 }
 // A directional model selection does not require a GI return-ranking fit.
 // Keep it distinct from the approved recommendation registry and its grades.
 // A market that already failed exact-price evaluation remains withheld.
 const selectionSide=data.giStatus?.[key]?.reason==='price_validation_failed'?null:pricing?.candidateSide;
 const modelSelection=selectionSide?{
  side:selectionSide as 'OVER'|'UNDER',line:row.sportsbookLine,
  price:selectionSide==='OVER'?row.overPrice:row.underPrice,
  sportsbook:row.sportsbook,sportsbookKey:row.sportsbookKey,quoteId:row.quoteId,
  quoteUpdatedAt:row.quoteUpdatedAt,calculatedAt:new Date(now).toISOString(),
  basis:'fitted_distribution_and_exact_quote',validatedForBetting:false,
 }:null;
 return {status:'available',projection:Math.round(f.projection*10)/10,expectedWorkload:Math.round(f.expectedWorkload*10)/10,
  workloadUnit:['nba','wnba','cbb'].includes(sport)?'minutes':market==='passing_yards'?'pass attempts':market==='rushing_yards'?'carries':sport==='nhl'?'minutes':'targets',
  interval80:{lower:Math.round(values[Math.floor((values.length-1)*.1)]*10)/10,upper:Math.round(values[Math.floor((values.length-1)*.9)]*10)/10},
  modelId:model.featurePolicy==='basketball_context'?'basketball-context-distribution-candidate-v1':'workload-distribution-candidate-v2',modelGroup:key,
  trainedThrough:model.trainedThrough,calibratedThrough:model.calibratedThrough,latestHistoryAt:latest.gameTime,calculatedAt:new Date(now).toISOString(),snapshotAsOf:data.asOf,snapshotSha256:data.digest,
  giScore:gi?.score??null,giEstimatedUnitReturn:gi?.estimatedUnitReturn??null,giReason:gi?.reason||data.giStatus?.[key]?.reason||(!pricing?'verified_quote_unavailable':'GI_exact_price_calibration_missing'),
  candidateSide:pricing?.candidateSide&&gi?.score>0&&gi?.estimatedUnitReturn!=null&&gi.estimatedUnitReturn>=.03?pricing.candidateSide:null,
  modelSelection,
  selectionReason:modelSelection?null:data.giStatus?.[key]?.reason==='price_validation_failed'?'price_validation_failed':!pricing?'verified_quote_unavailable':'price_threshold_not_met',
  // Comparison and probabilities are research calculations, never a pick.
  priceComparison:pricing?{overProbability:pricing.over,underProbability:pricing.under,pushProbability:pricing.push,overExpectedReturn:pricing.overEv,underExpectedReturn:pricing.underEv}:null,
  validatedForBetting:false,reason:null,
 };
}
export async function attachFittedResearchForecasts(payload:any,sport:string,now=Date.now()){
 if(!Array.isArray(payload?.rows)||!payload.rows.length)return payload;
 let data:RuntimeBundle;try{data=bundle()}catch(e){console.error('[forecast runtime]',e instanceof Error?e.message:'unavailable');return {...payload,rows:payload.rows.map((r:any)=>({...r,researchForecast:unavailable('model_snapshot_unavailable')}))}}
 // Reuse the same official gamelog URL/cache as the rankings route. Historical
 // team IDs come from each event, so a transfer cannot inherit another team's role.
 if(sport==='nfl'||sport==='nhl'){
  const players=[...new Map<string,any>(payload.rows.filter((r:any)=>/^\d+$/.test(String(r.playerId))&&Date.parse(r.gameTime)>now&&!r.frozen&&!r.lockedAtKickoff).map((r:any)=>[String(r.playerId),r])).values()];
  const updates:OpportunityGame[]=[];
  for(let i=0;i<players.length;i+=4)await Promise.all(players.slice(i,i+4).map(async row=>{
   const season=String(row.season),url=sport==='nhl'?`https://api-web.nhle.com/v1/player/${encodeURIComponent(row.playerId)}/game-log/${encodeURIComponent(season)}/2`:`https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${encodeURIComponent(row.playerId)}/gamelog?season=${encodeURIComponent(season)}`;
   try{const r=await providerFetch(url);if(!r.ok)return;const identity={sport,season,playerId:String(row.playerId),playerName:row.playerName,source:url,retrievedAt:new Date(now).toISOString()};const payload=await r.json();updates.push(...(sport==='nhl'?nhlOpportunityGames(payload,identity):espnOpportunityGames(payload,identity)))}catch{}
  }));
  if(updates.length){const merged=new Map(data.observations.map(r=>[[r.sport,r.market,r.playerId,r.gameId].join('|'),r]));for(const r of updates)merged.set([r.sport,r.market,r.playerId,r.gameId].join('|'),r);data={...data,observations:[...merged.values()]}}
 }
 const rows=payload.rows.map((r:any)=>({...r,researchForecast:fittedResearchForecast(r,sport,String(payload.market||r.market||''),data,now)}));
 return {...payload,rows,fittedResearchForecastCount:rows.filter((r:any)=>r.researchForecast.status==='available').length,
  modelSelectionCount:rows.filter((r:any)=>r.researchForecast.modelSelection!=null).length};
}
