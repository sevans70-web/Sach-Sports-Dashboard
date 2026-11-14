export function createNhlShadowScorer(clusteredMeanInterval){return function scoreShadowRecords(records,cohort){
function summarize(all,minimumFixtures){
 const settled=all.filter(r=>r.grade),nonpush=settled.filter(r=>r.grade.actual!==r.body.quote.line);
 const differences=nonpush.map(r=>{const c=r.body.forecast.pricing,b=r.body.baseline.pricing,y=Number(r.grade.actual>r.body.quote.line);return {gameId:r.body.target.gameId,value:(c.over/(c.over+c.under)-y)**2-(b.over/(b.over+b.under)-y)**2};});
 const picked=settled.filter(r=>r.body.forecast.pricing.candidateSide),profits=picked.map(r=>({gameId:r.body.target.gameId,value:r.grade.profit}));
 const brier=clusteredMeanInterval(differences),roi=clusteredMeanInterval(profits),fixtures=new Set(settled.map(r=>r.body.target.gameId)).size;
 return {captured:all.length,settled:settled.length,pending:all.length-settled.length,fixtures,selected:picked.length,over:picked.filter(r=>r.body.forecast.pricing.candidateSide==='OVER').length,under:picked.filter(r=>r.body.forecast.pricing.candidateSide==='UNDER').length,pushes:settled.length-nonpush.length,brierDifferenceCluster95:brier,unitRoiCluster95:roi,evidenceGates:{minimumFinalFixtures:fixtures>=minimumFixtures,requiredFixtures:minimumFixtures,nonregressionUpper95:brier!=null&&brier.upper95<=0,positiveReturnLower95:roi!=null&&roi.lower95>0}};
}
const results={};
for(const market of ['goals','assists']){
 const rows=records.filter(r=>r.body.target.market===market),lines=[...new Set(rows.map(r=>r.body.quote.line))];
 results[market]={all:summarize(rows,100),originalTen:summarize(rows.filter(r=>cohort.has(r.body.target.playerId)),30),byLine:Object.fromEntries(lines.map(line=>[line,summarize(rows.filter(r=>r.body.quote.line===line),20)]))};
}
return {kind:'cw08_nhl_shadow_summary',results,releaseApproved:false,reason:'Research evidence gates only; insufficient/missing groups fail closed. Independent pregame anchoring and application release checks remain mandatory. No automatic production promotion.'};
};}
