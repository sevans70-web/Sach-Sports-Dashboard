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
import {createNhlShadowScorer} from './nhl-shadow-score-core.mjs';
console.log(JSON.stringify(createNhlShadowScorer(clusteredMeanInterval)(records,cohort),null,2));
