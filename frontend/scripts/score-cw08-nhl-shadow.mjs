/** Read-only evaluation of original receipts and separately stored final grades. */
import {readFile,readdir} from 'node:fs/promises';import {resolve} from 'node:path';
import {verifyShadowReceipt,gradeNhlShadow,canonical} from './nhl-shadow-evidence.mjs';import {loadTs} from '../tests/load-ts.mjs';
const {clusteredMeanInterval}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const [directory]=process.argv.slice(2);if(!directory)throw Error('Usage: node scripts/score-cw08-nhl-shadow.mjs STUDY_DIRECTORY');
const cohort=new Set(JSON.parse(await readFile(new URL('../model-research/cw08-nhl-expanded/feature-receipt.json',import.meta.url),'utf8')).originalPlayers);
const list=async path=>{try{return (await readdir(path)).filter(f=>f.endsWith('.json'));}catch(e){if(e.code==='ENOENT')return [];throw e;}};
const records=[],seen=new Set();let protocol=null,freeze=null;
for(const file of await list(resolve(directory,'receipts'))){
 const receipt=JSON.parse(await readFile(resolve(directory,'receipts',file),'utf8')),body=verifyShadowReceipt(receipt),key=[body.target.market,body.target.gameId,body.target.playerId].join('|');
 if(seen.has(key))throw Error('Duplicate shadow target');seen.add(key);
 if(protocol&&protocol!==body.protocolSha256||freeze&&freeze!==body.modelFreeze.commit)throw Error('Mixed shadow study artifacts');protocol=body.protocolSha256;freeze=body.modelFreeze.commit;
 let grade=null;try{grade=JSON.parse(await readFile(resolve(directory,'grades',receipt.sha256+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(grade){const replay=gradeNhlShadow(receipt,grade.official,Date.parse(grade.gradedAt));const {official,...saved}=grade;if(canonical(replay)!==canonical(saved))throw Error('Grade does not reproduce exact receipt and official result');}
 records.push({receipt,body,grade});
}
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
console.log(JSON.stringify({kind:'cw08_nhl_shadow_summary',results,releaseApproved:false,reason:'Research evidence gates only; insufficient/missing groups fail closed. Independent pregame anchoring and application release checks remain mandatory. No automatic production promotion.'},null,2));
