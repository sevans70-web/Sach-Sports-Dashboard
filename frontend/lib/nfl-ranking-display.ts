import {verifiedPropQuote} from '@/lib/prop-integrity';
import {excludeUnavailableRanking} from '@/lib/ranking-availability';
import {cardModelProjection} from '@/lib/saved-model-pick';
import {estimatedEv,rankedModelComparison} from '@/lib/estimated-ev';
/** Ranking coverage is not betting eligibility. Keep genuine quote-backed
 * research browsable without promoting missing/failed probabilities to picks. */
export function nflRankingDisplay(row:any,now=Date.now()){
 if(row?.sport!=='nfl'||!row.playerId||!row.gameId||row.withdrawnFromBoard||row.resultStatus==='void'||row.archivedOriginal?.resultStatus==='void'||excludeUnavailableRanking(row,now))return null;
 const capture=Date.parse(row.boardCapturedAt||row.capturedAt||''),start=Date.parse(row.gameTime||'');
 const recorded=Number.isFinite(capture)&&capture<=now&&capture<start;
 const saved=row.boardFrozen===true&&recorded;
 if(!verifiedPropQuote(row,now,saved))return null;
 const forecast=row.researchForecast,decision=Date.parse(forecast?.calculatedAt||forecast?.modelSelection?.calculatedAt||'');
 const timely=Number.isFinite(decision)&&decision<=now&&decision<start&&(!saved||decision<=capture);
 const fitted=timely?cardModelProjection(row,now):null;
 // A baseline is labelled separately and never supplies direction, probability or EV.
 const baseline=!String(row.market).startsWith('q1_')&&typeof row.modelProjection==='number'&&Number.isFinite(row.modelProjection)&&row.modelProjection>=0?row.modelProjection:null;
 const selected=estimatedEv(row,now),comparison=rankedModelComparison(row,now);
 const ev=selected.status==='available'?selected:comparison?{status:'available' as const,percent:comparison.percent,side:comparison.side,reason:null}:selected;
 const confidence=ev.status==='available'?100*(ev.side==='OVER'?forecast.priceComparison.overProbability:forecast.priceComparison.underProbability):null;
 const reasons:Record<string,string>={market_model_not_fitted:'A fitted forecast is not available for this market',fewer_than_five_quarter_history_games:'At least five verified quarter-history games are needed',recent_official_history_unavailable:'Recent official player history is unavailable',player_team_history_unavailable:'Verified player/team history is unavailable',reported_unavailable:'Player is reported unavailable',missing_exact_pregame_context:'Exact pregame matchup evidence is missing'};
 const reason=ev.status==='available'?null:forecast?.giReason==='price_validation_failed'||forecast?.selectionReason==='price_validation_failed'?'Model probability accuracy checks not met; confidence and EV are unavailable':reasons[forecast?.reason]||ev.reason;
 const line=row.sportsbookLine;
 const direction=ev.status==='available'?ev.side:fitted!=null&&row.lineType==='main'&&typeof line==='number'&&Number.isFinite(line)&&recorded?(fitted>line?'OVER':fitted<line?'UNDER':'AT LINE'):null;
 return {projection:fitted,baseline,confidence,direction,projectionLabel:fitted!=null?'Sach Projection':'Historical baseline',quoteBasis:saved?'saved_pregame':'current',reason,ev};
}
/** Add diagnostics without rewriting a row, its rank, forecast, selection or receipt. */
export function nflRankingPayload(payload:any,now=Date.now()){
 if(!Array.isArray(payload?.rows))return payload;
 const visible=payload.rows.map((row:any)=>nflRankingDisplay(row,now)).filter(Boolean),reasons:Record<string,number>={};
 for(const evidence of visible)if(evidence.reason)reasons[evidence.reason]=(reasons[evidence.reason]||0)+1;
 return {...payload,nflCoverage:{sourceRows:payload.rows.length,displayableRows:visible.length,fittedProjections:visible.filter((e:any)=>e.projection!=null).length,baselineOnly:visible.filter((e:any)=>e.projection==null&&e.baseline!=null).length,savedQuoteRows:visible.filter((e:any)=>e.quoteBasis==='saved_pregame').length,evAvailable:visible.filter((e:any)=>e.ev.status==='available').length,reasons}};
}
