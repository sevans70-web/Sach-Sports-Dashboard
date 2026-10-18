import {nullableNumber} from "@/lib/provider-fetch";

export const PROP_INTEGRITY_VERSION = 1;
export const PROP_REVIEW_NOTICE = "Research only — sportsbook quotes and historical baselines are not validated Sach betting recommendations. GI and picks are withheld pending model validation.";
// An ingest flag, a high heuristic GI, or a client-supplied boolean cannot
// certify a forecasting model. Register a model here only after a reviewed,
// time-separated backtest and calibration report exist in the repository.
const VALIDATED_MODELS: ReadonlySet<string> = new Set();

export function verifiedPropQuote(row:any, now=Date.now(), historical=false){
  if(row?.quoteVersion!==1 || !row.sportsbookKey || !row.sportsbook || !row.gameId || !row.playerId) return false;
  const stamp=Date.parse(row.quoteUpdatedAt||""), kickoff=Date.parse(row.gameTime||"");
  const over=nullableNumber(row.overPrice), under=nullableNumber(row.underPrice);
  const scorer=row.lineType==="scorer";
  if(!Number.isFinite(stamp)||!Number.isFinite(kickoff)||over==null||Math.abs(over)<100) return false;
  if(!scorer&&(row.lineType!=="main"||nullableNumber(row.sportsbookLine)==null||under==null||Math.abs(under)<100)) return false;
  if(row.recoveredAfterStart===true) return false;
  // A frozen pregame quote remains valid evidence after the game ends. It is
  // not replaced with a live quote or subjected to today's freshness cutoff.
  if(historical || kickoff<=now){
    const capture=Date.parse(row.savedAt||row.capturedAt||"");
    return Number.isFinite(capture)&&capture<kickoff&&stamp<=capture+60_000&&capture-stamp<=15*60_000;
  }
  return stamp<=now+60_000&&now-stamp<=15*60_000;
}

export function eligiblePropPrediction(row:any,now=Date.now(),historical=false){
  return verifiedPropQuote(row,now,historical) && VALIDATED_MODELS.has(String(row?.forecastModelId||"")) &&
    row?.forecastValidation?.passed===true && ["OVER","UNDER","YES","FIRST BASKET"].includes(row.prediction||row.pickSide) &&
    row?.withdrawnFromBoard!==true && row?.recoveredAfterStart!==true;
}

export function integrityRow(row:any,sport:string,market=String(row?.market||""),now=Date.now()){
  if(row?.integrityVersion===PROP_INTEGRITY_VERSION){
    if(row.quoteVerified&&!verifiedPropQuote(row,now))return {...row,quoteVerified:false,sportsbookLine:null,reviewReason:"Quote is no longer fresh or pregame capture cannot be established"};
    return row;
  }
  const verified=verifiedPropQuote(row,now);
  const eligible=eligiblePropPrediction(row,now);
  const quarter=market.startsWith("q1_");
  const original={sportsbookLine:row.sportsbookLine??null,prediction:row.prediction??row.pickSide??null,
    modelProjection:row.modelProjection??null,giScore:row.giScore??null,modelProbability:row.modelProbability??null,
    resultStatus:row.resultStatus??row.status??null,summary:row.summary??""};
  const reason=!verified?(row.recoveredAfterStart?"Quote captured after start or capture timing not established":"No fresh, traceable pregame main-market quote"):
    quarter?"No validated quarter-specific forecast":"Historical baseline is not a validated matchup forecast";
  return {...row,integrityVersion:PROP_INTEGRITY_VERSION,sport,market,quoteVerified:verified,
    recommendationEligible:eligible,researchOnly:!eligible,reviewReason:eligible?null:reason,
    archivedOriginal:original,
    sportsbookLine:verified?row.sportsbookLine:null,
    // Do not display full-game/4 as an independent quarter forecast.
    modelProjection:!eligible&&quarter?null:row.modelProjection??null,
    giScore:eligible?row.giScore:null,modelProbability:eligible?row.modelProbability:null,
    prediction:eligible?(row.prediction||row.pickSide):"NO PICK",pickSide:eligible?(row.prediction||row.pickSide):null,
    resultStatus:eligible?row.resultStatus:null,resultSymbol:eligible?row.resultSymbol:"",
    summary:eligible?row.summary:`${reason}. Research only; no Sach recommendation or verified betting grade.`,
  };
}

export function guardRankingPayload(payload:any,sport:string){
  if(!payload||!Array.isArray(payload.rows)) return payload;
  const rows=payload.rows.map((r:any)=>integrityRow(r,sport,String(payload.market||r.market||"")));
  return {...payload,rows,integrityVersion:PROP_INTEGRITY_VERSION,warning:PROP_REVIEW_NOTICE,
    verifiedPredictions:rows.filter((r:any)=>r.recommendationEligible).length,
    verifiedQuoteCount:rows.filter((r:any)=>r.quoteVerified).length,researchCount:rows.filter((r:any)=>r.researchOnly).length};
}

export function guardPerformancePayload(payload:any,sport:string){
  const key=Array.isArray(payload?.predictions)?"predictions":Array.isArray(payload?.results)?"results":null;
  if(!key)return payload;
  const history=payload[key],eligible=history.filter((r:any)=>eligiblePropPrediction(r,Date.now(),true));
  const research=history.filter((r:any)=>!eligiblePropPrediction(r,Date.now(),true));
  const activeResearch=research.filter((r:any)=>r.withdrawnFromBoard!==true&&r.status!=="void");
  const researchHits=activeResearch.filter((r:any)=>r.status==="hit").length;
  const researchMisses=activeResearch.filter((r:any)=>r.status==="miss").length;
  const researchPushes=activeResearch.filter((r:any)=>r.status==="push").length;
  const researchSummary={total:research.length,awaitingResult:activeResearch.filter((r:any)=>r.status==="pending").length,completed:researchHits+researchMisses+researchPushes,hits:researchHits,misses:researchMisses,pushes:researchPushes,hitRate:researchHits+researchMisses?Math.round(researchHits/(researchHits+researchMisses)*1000)/10:null,void:research.length-activeResearch.length};
  const hits=eligible.filter((r:any)=>r.status==="hit").length,misses=eligible.filter((r:any)=>r.status==="miss").length;
  return {...payload,integrityVersion:PROP_INTEGRITY_VERSION,warning:PROP_REVIEW_NOTICE,
    researchSummary,
    historicalEntries:history.length,excludedResearchEntries:history.length-eligible.length,
    total:eligible.length,hits,misses,settled:hits+misses,pushes:eligible.filter((r:any)=>r.status==="push").length,
    pending:eligible.filter((r:any)=>r.status==="pending").length,hitRate:hits+misses?Math.round(hits/(hits+misses)*1000)/10:null,
    [key]:history.map((r:any)=>({...integrityRow(r,sport),status:eligiblePropPrediction(r,Date.now(),true)?r.status:"research",historicalStatus:r.status})),
  };
}
