import {createHash} from 'node:crypto';
/** Snapshot hashes identify fitted artifacts, not refreshed feature inputs.
 * Retain the actual vector used for each new forecast, independently of future
 * provider revisions. No receipt is backfilled onto historical predictions. */
export function forecastInputReceipt(group:string,snapshotSha256:string,decisionAt:string,features:number[]){
 if(!group||!snapshotSha256||!Number.isFinite(Date.parse(decisionAt))||!Array.isArray(features)||!features.length||!features.every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('Invalid forecast input receipt');
 const evidence={version:1 as const,group,snapshotSha256,decisionAt,features:[...features]};
 return {...evidence,sha256:createHash('sha256').update(JSON.stringify(evidence)).digest('hex')};
}
