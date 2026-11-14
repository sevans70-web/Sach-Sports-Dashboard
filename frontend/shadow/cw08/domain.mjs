import {nhlShadowForecast,priceNhlShadow} from '../../lib/nhl-shadow-model.ts';
import {forecastDistribution,evaluatePrice,quoteProblem,clusteredMeanInterval} from '../../lib/probability-forecast.ts';
import {createNhlShadowEvidence} from '../../scripts/nhl-shadow-evidence-core.mjs';
import models from '../../model-research/cw08-nhl-v3/models.json';
import policy from '../../model-research/cw08-nhl-v3/shadow-protocol.json';
import seed from '../../model-research/cw08-nhl-v3/cloudflare-shadow-manifests.json';
import baselines from './frozen-baselines.json';
export const evidence=createNhlShadowEvidence({nhlShadowForecast,priceNhlShadow,forecastDistribution,evaluatePrice,quoteProblem});
export {models,policy,seed,baselines};
export const study='cw08-nhl-v3-prospective-shadow';
export const targetKey=t=>[t.market,t.gameId,t.playerId].join('|');
// Node and workerd can differ by a few floating-point ULPs in exp/log.
// Preserve the saved bytes; compare reproduced numbers within the established
// 1e-10 replay tolerance. Side, scope, prices, hashes and frozen coefficients
// still require exact identity.
export function sameReplay(a,b){
 if(typeof a==='number'&&typeof b==='number')return Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-10*Math.max(1,Math.abs(a),Math.abs(b));
 if(a===null||b===null||typeof a!=='object'||typeof b!=='object')return a===b;
 if(Array.isArray(a)!==Array.isArray(b))return false;
 const ka=Object.keys(a).sort(),kb=Object.keys(b).sort();return ka.length===kb.length&&ka.every((k,i)=>k===kb[i]&&sameReplay(a[k],b[k]));
}
export function verifyForecast(receipt){
 const r=evidence.verifyShadowReceipt(receipt),market=r.target.market;
 if(r.target.sport!=='nhl'||!['goals','assists'].includes(market)||r.modelFreeze.commit!=='007c02b'||r.protocolSha256!==seedProtocolHash||evidence.canonical(r.model)!==evidence.canonical(models[market])||evidence.canonical(r.baselineModel)!==evidence.canonical(baselines[market]))throw Error('frozen_artifact_mismatch');
 const time=Date.parse(r.target.gameTime);if(time<Date.parse(policy.gameTimeFrom)||time>=Date.parse(policy.gameTimeBefore))throw Error('outside_protocol');
 const candidate=nhlShadowForecast(r.model,r.history,r.target,r.createdAt);
 if(!candidate.forecast||!sameReplay({...candidate.forecast,pricing:priceNhlShadow(candidate.forecast,r.quote)},r.forecast))throw Error('forecast_does_not_reproduce');
 const baseline=forecastDistribution(r.baselineModel,r.history,r.target,r.createdAt);
 if(!baseline.forecast||!sameReplay({projection:baseline.forecast.projection,features:baseline.forecast.inputFeatures,pricing:evaluatePrice(baseline.forecast.values,r.quote)},r.baseline))throw Error('baseline_does_not_reproduce');
 return r;
}
// Hash the original file bytes, including formatting/newline, not a reserialization.
import protocolText from '../../model-research/cw08-nhl-v3/shadow-protocol.json?raw';
export const seedProtocolHash=evidence.digest(protocolText);
export function capture(entry,now){
 const market=entry.target.market;
 if(Date.parse(entry.target.gameTime)<Date.parse(policy.gameTimeFrom)||Date.parse(entry.target.gameTime)>=Date.parse(policy.gameTimeBefore))throw Error('outside_protocol');
 return evidence.captureNhlShadow({...entry,model:models[market],baselineModel:baselines[market],modelFreeze:{commit:'007c02b',at:'2026-11-14T01:35:06.000Z',modelDigest:evidence.digest(models[market]),implementationDigest:FROZEN_IMPLEMENTATION_DIGEST},protocolSha256:seedProtocolHash},now);
}
// The build replaces this identifier with the SHA-256 of the pinned implementation.
const FROZEN_IMPLEMENTATION_DIGEST=__CW08_IMPLEMENTATION_DIGEST__;

import {createNhlShadowScorer} from '../../scripts/nhl-shadow-score-core.mjs';
import cohort from '../../model-research/cw08-nhl-expanded/feature-receipt.json';
export const scoreRecords=records=>createNhlShadowScorer(clusteredMeanInterval)(records,new Set(cohort.originalPlayers));
