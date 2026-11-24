import {verifiedPropQuote} from '@/lib/prop-integrity';
import {excludeUnavailableRanking} from '@/lib/ranking-availability';
import {cardModelProjection} from '@/lib/saved-model-pick';
import {nflRankingEv} from '@/lib/nfl-ranking-ev';
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
 const fitted=timely&&(!forecast.modelGroup||forecast.modelGroup==='nfl|'+row.market)?cardModelProjection(row,now):null;
 // A baseline is labelled separately and never supplies direction, probability or EV.
 const baseline=!String(row.market).startsWith('q1_')&&typeof row.modelProjection==='number'&&Number.isFinite(row.modelProjection)&&row.modelProjection>=0?row.modelProjection:null;
 const ev=nflRankingEv(row,now);
 const confidence=ev.status==='available'?100*(ev.side==='OVER'?forecast.priceComparison.overProbability:forecast.priceComparison.underProbability):null;
 const reason=ev.status==='available'?null:ev.reason;
 const line=row.sportsbookLine;
 const invalidEvidence=ev.status!=='available'&&['model_identity_mismatch','quote_identity_mismatch','quote_binding_or_timing_invalid','selection_evidence_invalid','invalid_probabilities'].includes(ev.code);
 const direction=ev.status==='available'?ev.side:!invalidEvidence&&fitted!=null&&row.lineType==='main'&&typeof line==='number'&&Number.isFinite(line)&&recorded?(fitted>line?'OVER':fitted<line?'UNDER':'AT LINE'):null;
 return {projection:fitted,baseline,confidence,direction,projectionLabel:fitted!=null?'Sach Projection':'Historical baseline',quoteBasis:saved?'saved_pregame':'current',reason,ev};
}
/** Add diagnostics without rewriting a row, its rank, forecast, selection or receipt. */
export function nflRankingPayload(payload:any,now=Date.now()){
 if(!Array.isArray(payload?.rows))return payload;
 const visible=payload.rows.map((row:any)=>nflRankingDisplay(row,now)).filter(Boolean),reasons:Record<string,number>={},evCodes:Record<string,number>={};
 for(const evidence of visible)if(evidence.reason)reasons[evidence.reason]=(reasons[evidence.reason]||0)+1;
 for(const evidence of visible)if(evidence.ev.code)evCodes[evidence.ev.code]=(evCodes[evidence.ev.code]||0)+1;
 return {...payload,nflCoverage:{sourceRows:payload.rows.length,displayableRows:visible.length,fittedProjections:visible.filter((e:any)=>e.projection!=null).length,baselineOnly:visible.filter((e:any)=>e.projection==null&&e.baseline!=null).length,savedQuoteRows:visible.filter((e:any)=>e.quoteBasis==='saved_pregame').length,evAvailable:visible.filter((e:any)=>e.ev.status==='available').length,evCodes,reasons}};
}
