import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {loadTs} from '../tests/load-ts.mjs';
const {nhlShadowForecast,priceNhlShadow}=await loadTs(new URL('../lib/nhl-shadow-model.ts',import.meta.url));
const {forecastDistribution,evaluatePrice,quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
import {createNhlShadowEvidence} from './nhl-shadow-evidence-core.mjs';
export const {canonical,digest,verifyShadowReceipt,captureNhlShadow,gradeNhlShadow}=createNhlShadowEvidence({nhlShadowForecast,priceNhlShadow,forecastDistribution,evaluatePrice,quoteProblem});
export async function saveShadowReceipt(directory,receipt){
 const body=verifyShadowReceipt(receipt);await mkdir(directory,{recursive:true});
 const {market,gameId,playerId}=body.target;
 if(!/^(goals|assists)$/.test(market)||!/^\d+$/.test(gameId)||!/^\d+$/.test(playerId))throw Error('Invalid shadow identity');
 const path=resolve(directory,`${market}-${gameId}-${playerId}.json`);
 await writeFile(path,canonical(receipt)+'\n',{flag:'wx',mode:0o444});
 const saved=JSON.parse(await readFile(path,'utf8'));verifyShadowReceipt(saved);return path;
}
