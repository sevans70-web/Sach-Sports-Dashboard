// Pure research reporting: no model fitting, selection or historical writes.
export function confidenceSummary(decisions,policy){
 const rows=decisions.filter(d=>!d.push&&Number.isFinite(d[policy]?.over)&&typeof d[policy]?.directionWon==='boolean').map(d=>({side:d[policy].direction,confidence:d[policy].direction==='OVER'?d[policy].over:1-d[policy].over,hit:Number(d[policy].directionWon)}));
 const summarize=rs=>{const count=rs.length,meanConfidence=count?rs.reduce((s,r)=>s+r.confidence,0)/count:null,hitRate=count?rs.reduce((s,r)=>s+r.hit,0)/count:null;return {count,meanConfidence,hits:rs.reduce((s,r)=>s+r.hit,0),hitRate,overconfidenceGap:count?meanConfidence-hitRate:null};};
 return ['ALL','OVER','UNDER'].map(side=>{const rs=rows.filter(r=>side==='ALL'||r.side===side);return {side,...summarize(rs),atLeast80:summarize(rs.filter(r=>r.confidence>=.8)),bins:[[.5,.6],[.6,.7],[.7,.8],[.8,.9],[.9,1]].map(([from,to])=>({from,to,...summarize(rs.filter(r=>r.confidence>=from&&(to===1?r.confidence<=to:r.confidence<to)))}))};});
}
