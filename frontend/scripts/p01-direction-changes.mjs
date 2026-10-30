// Diagnose fixed-model side changes; never fit, select, or write live history.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,basename} from 'node:path';
import {pathToFileURL} from 'node:url';
export function directionChanges(decisions){
 const groups=new Map();
 for(const d of decisions){
  if(d.push)continue;
  const a=d.baseline,b=d.candidate;
  if(!['OVER','UNDER'].includes(a?.direction)||!['OVER','UNDER'].includes(b?.direction)||typeof a.directionWon!=='boolean'||typeof b.directionWon!=='boolean')continue;
  if(a.direction===b.direction&&a.directionWon!==b.directionWon||a.direction!==b.direction&&a.directionWon===b.directionWon)throw Error('Inconsistent paired direction outcomes');
  const key=[d.target.market,a.direction,b.direction].join('|');
  if(!groups.has(key))groups.set(key,{market:d.target.market,baselineSide:a.direction,candidateSide:b.direction,calls:0,baselineHits:0,candidateHits:0,games:new Set()});
  const r=groups.get(key);r.calls++;r.baselineHits+=Number(a.directionWon);r.candidateHits+=Number(b.directionWon);r.games.add(d.target.gameId);
 }
 return [...groups.values()].map(({games,...r})=>({...r,independentGames:games.size,netHits:r.candidateHits-r.baselineHits})).sort((a,b)=>a.market.localeCompare(b.market)||a.baselineSide.localeCompare(b.baselineSide)||a.candidateSide.localeCompare(b.candidateSide));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [source,output]=process.argv.slice(2);if(!source||!output)throw Error('Provide scored report and NEW output file');
 const bytes=await readFile(source),report=JSON.parse(bytes);
 const sourceHash=createHash('sha256').update(bytes).digest('hex');
 const receipt=JSON.parse(await readFile(resolve(dirname(source),'receipt.json')));
 if(receipt.files?.[basename(source)]!==sourceHash||receipt.cohortSha256!==report.cohortSha256)throw Error('Scored report receipt mismatch');
 const result={sourceSha256:createHash('sha256').update(bytes).digest('hex'),cohortSha256:report.cohortSha256,selected:report.selected,resolved:report.resolved,pending:report.pending,unresolved:report.unresolved,transitions:directionChanges(report.decisions),livePromotion:false};
 await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
}
