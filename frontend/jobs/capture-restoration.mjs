import {PREGAME_CAPTURE_CRON} from '../scripts/worker-pregame-capture.mjs';

export const captureControl='control:nba-acceptance';
export const maxCaptureHoldMs=100*60000;

export function allowRoutineJob(job){
 return job.sport!=='nba'||!['capture','replay'].includes(job.kind);
}

export function freshCaptureTick(cron,scheduledTime,now){
 const interval=cron===PREGAME_CAPTURE_CRON?120000:cron==='*/5 * * * *'?300000:0;
 return interval>0&&Number.isFinite(scheduledTime)&&scheduledTime<=now&&
  Math.floor(scheduledTime/interval)===Math.floor(now/interval);
}
