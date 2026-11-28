import {timingSafeEqual} from 'node:crypto';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {checksum,cloudRequest} from '../scripts/history-cloud.mjs';
import {torontoCaptureDay} from '../scripts/worker-pregame-capture.mjs';

import {captureControl,maxCaptureHoldMs} from './capture-restoration.mjs';

export const acceptanceQueue=captureControl;

export class NbaAcceptanceOperator extends WorkerEntrypoint{
 acceptNbaPoints(request){
  return this.env.DASHBOARD_JOBS.getByName(acceptanceQueue).acceptNbaPoints(request);
 }
}

export function acceptanceWindow(env){
 let grant;
 try{grant=JSON.parse(env.SACH_NBA_ACCEPTANCE_GRANT);}catch{return null;}
 if(!grant||!/^\d{4}-\d{2}-\d{2}$/.test(grant.day)||!(/^[a-f0-9]{64}$/.test(grant.scheduleSha256)))return null;
 if(grant.providerMode!==undefined&&grant.providerMode!=='owl-only')return null;
 const starts=Date.parse(grant.holdStartsAt),expires=Date.parse(grant.expiresAt),lock=Date.parse(grant.lockAt);
 if(![starts,expires,lock].every(Number.isFinite)||starts>=expires||expires>lock||
    expires-starts>maxCaptureHoldMs||torontoCaptureDay(starts)!==grant.day||torontoCaptureDay(lock)!==grant.day)return null;
 return {day:grant.day,starts,lock,expires,scheduleSha256:grant.scheduleSha256,
  ...(grant.providerMode===undefined?{}:{providerMode:grant.providerMode})};
}

export function activeAcceptanceWindow(grant,now){
 return Boolean(grant&&grant.starts<=now&&now<grant.expires);
}

export function oneShotJobError(job,env,now){
 const saved=job.acceptance;
 if(!saved||!Number.isFinite(saved.expires)||now>=saved.expires)return 'acceptance_closed';
 const current=acceptanceWindow(env);
 if(!activeAcceptanceWindow(current,now)||job.sport!=='nba'||job.kind!=='capture'||job.market!=='points'||
    job.id!=='acceptance:nba:points:'+saved.day||
    ['day','starts','lock','expires','scheduleSha256','providerMode'].some(key=>current[key]!==saved[key]))return 'acceptance_revoked';
 return null;
}

export function acceptanceGrant(env, request, now) {
 const token=env.SACH_NBA_ACCEPTANCE_OPERATOR_TOKEN;
 if(typeof token!=='string'||token.length<32||typeof request?.token!=='string'||
    Buffer.byteLength(request.token)!==Buffer.byteLength(token)||
    !timingSafeEqual(Buffer.from(request.token),Buffer.from(token)))throw Error('acceptance_unauthorized');
 if(request.sport!=='nba'||request.market!=='points')throw Error('acceptance_invalid_scope');
 const grant=acceptanceWindow(env);
 if(!grant)throw Error('acceptance_no_grant');
 if(grant.day!==request.day||grant.day!==torontoCaptureDay(now))throw Error('acceptance_invalid_scope');
 if(!activeAcceptanceWindow(grant,now))throw Error('acceptance_closed');
 return grant;
}

export async function requireApprovedSchedule(grant) {
 let fixtures;
 try{
  fixtures=await cloudRequest('rpc/verified_nba_board_schedule?p_day='+grant.day,{signal:AbortSignal.timeout(2500)});
 }catch{throw Error('acceptance_schedule_unverified');}
 if(!fixtures||Array.isArray(fixtures)||typeof fixtures!=='object'||
    checksum(fixtures)!==grant.scheduleSha256)throw Error('acceptance_schedule_unverified');
 const times=Object.values(fixtures).map(value=>Date.parse(value));
 if(!times.length||times.some(time=>torontoCaptureDay(time)!==grant.day)||Math.min(...times)!==grant.lock)
  throw Error('acceptance_schedule_unverified');
}
