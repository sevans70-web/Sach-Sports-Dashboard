import {timingSafeEqual} from 'node:crypto';
import {WorkerEntrypoint} from 'cloudflare:workers';
import {checksum,cloudRequest} from '../scripts/history-cloud.mjs';
import {torontoCaptureDay} from '../scripts/worker-pregame-capture.mjs';

export const acceptanceQueue = 'control:nba-acceptance';

export class NbaAcceptanceOperator extends WorkerEntrypoint{
 acceptNbaPoints(request){
  return this.env.DASHBOARD_JOBS.getByName(acceptanceQueue).acceptNbaPoints(request);
 }
}

export function acceptanceGrant(env, request, now) {
 const token=env.SACH_NBA_ACCEPTANCE_OPERATOR_TOKEN;
 if(typeof token!=='string'||token.length<32||typeof request?.token!=='string'||
    Buffer.byteLength(request.token)!==Buffer.byteLength(token)||
    !timingSafeEqual(Buffer.from(request.token),Buffer.from(token)))throw Error('acceptance_unauthorized');
 if(request.sport!=='nba'||request.market!=='points')throw Error('acceptance_invalid_scope');
 let grant;
 try{grant=JSON.parse(env.SACH_NBA_ACCEPTANCE_GRANT);}catch{throw Error('acceptance_no_grant');}
 if(!grant||grant.day!==request.day||grant.day!==torontoCaptureDay(now)||
    !/^[a-f0-9]{64}$/.test(grant.scheduleSha256))throw Error('acceptance_invalid_scope');
 const expires=Date.parse(grant.expiresAt),lock=Date.parse(grant.lockAt);
 if(!Number.isFinite(expires)||!Number.isFinite(lock)||now>=expires||expires>lock||
    torontoCaptureDay(lock)!==grant.day)throw Error('acceptance_closed');
 return {day:grant.day,lock,expires,scheduleSha256:grant.scheduleSha256};
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
