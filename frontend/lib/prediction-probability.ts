import {estimatedEv} from '@/lib/estimated-ev';
/** Reuse exact saved quote/selection checks. A probability is for the saved
 * side, not necessarily OVER. Pushes remain separate from wins and losses. */
export function predictionProbability(row:any,now=Date.now()){
 const evidence=estimatedEv(row,now);
 if(evidence.status!=='available')return null;
 return {side:evidence.side,line:evidence.line,win:evidence.winProbability,loss:evidence.lossProbability,push:evidence.pushProbability,quoteId:evidence.quoteId,calculatedAt:evidence.calculatedAt,validatedForBetting:false};
}
export function predictionProbabilityText(row:any,now=Date.now()){
 const p=predictionProbability(row,now);return p?`${(p.win*100).toFixed(1)}% ${p.side}`:'—';
}
/** Score original predictions against settled results; no recalculation from
 * final statistics. Conditional binary Brier excludes pushes consistently. */
export function predictionAccuracy(rows:any[],now=Date.now()){
 const groups=new Map<string,any>();const seen=new Set<string>();let excluded=0;
 for(const row of [...rows].sort((a,b)=>Date.parse(a.boardCapturedAt||a.savedAt||'')-Date.parse(b.boardCapturedAt||b.savedAt||''))){
  const p=predictionProbability(row,now),sport=String(row.sport||''),market=String(row.market||'');
  const key=[sport,market,row.gameId,row.playerId].join('|');
  if(!p||!sport||!market||row.withdrawnFromBoard||((row.pickSide||row.prediction)&&String(row.pickSide||row.prediction)!==p.side)||seen.has(key)||!['hit','miss','push'].includes(row.status)){excluded++;continue;}
  seen.add(key);const groupKey=[sport,market,p.side].join('|');
  const g=groups.get(groupKey)||{sport,market,side:p.side,settled:0,pushes:0,wins:0,probabilitySum:0,brierSum:0,bins:Array.from({length:10},(_,i)=>({from:i/10,to:(i+1)/10,count:0,predictedSum:0,wins:0}))};
  if(row.status==='push')g.pushes++;
  else if(p.win+p.loss>0){const conditional=p.win/(p.win+p.loss),won=Number(row.status==='hit');g.settled++;g.wins+=won;g.probabilitySum+=conditional;g.brierSum+=(conditional-won)**2;const bin=g.bins[Math.min(9,Math.floor(conditional*10))];bin.count++;bin.predictedSum+=conditional;bin.wins+=won;}
  groups.set(groupKey,g);
 }
 return {excluded,validatedForBetting:false,probabilityBasis:'conditional_on_no_push',groups:[...groups.values()].map(g=>({sport:g.sport,market:g.market,side:g.side,settled:g.settled,pushes:g.pushes,wins:g.wins,losses:g.settled-g.wins,hitRate:g.settled?g.wins/g.settled:null,meanProbability:g.settled?g.probabilitySum/g.settled:null,brier:g.settled?g.brierSum/g.settled:null,calibration:g.bins.map((b:any)=>({from:b.from,to:b.to,count:b.count,predicted:b.count?b.predictedSum/b.count:null,observed:b.count?b.wins/b.count:null}))}))};
}
