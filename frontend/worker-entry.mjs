import dashboard from 'vinext/server/fetch-handler';
import {scheduledPregameCapture} from './scripts/worker-pregame-capture.mjs';
import {gradeSavedWorkerPicks} from './scripts/worker-pregame-grade.mjs';
import {createWorkerGradingReplay} from './lib/worker-grading-replay';
import {saveWorkerFinalCorrections} from './lib/worker-final-observations';
import {archiveWorkerHistoryDay,workerHistoryBackupScope} from './scripts/worker-history-backup.mjs';

export * from 'vinext/server/fetch-handler';

export default {
 ...dashboard,
 async scheduled(controller,env,ctx){
  if(controller.cron==='*/5 * * * *'){
   const report=await scheduledPregameCapture(env,dashboard,ctx,controller.scheduledTime);
   console.info('[sach-staging-pregame-capture]',JSON.stringify(report));
   // Only one sport every 30 minutes; capped to two official finals.
   // Grades never mutate the original pregame quote or model-pick tables.
   if(new Date(controller.scheduledTime).getUTCMinutes()%30===0){
    try{
     const settled=await gradeSavedWorkerPicks(env,dashboard,ctx,controller.scheduledTime);
     console.info('[sach-staging-original-grades]',JSON.stringify(settled));
    }catch(error){
     console.error('[sach-staging-original-grades-failed]',error instanceof Error?error.message:'grading failed');
    }
   }
   return;
  }
  // Temporary date-bound staging triggers check a recent completed day.
  // The daily schedule archives the oldest retained day before it ages out.
  const recent = controller.cron !== '10-17 9 * * *';
  const scope = workerHistoryBackupScope(controller.scheduledTime,recent);
  const replay = recent ? createWorkerGradingReplay(scope.sport) : null;
  const result = await archiveWorkerHistoryDay(env,scope,undefined,undefined,replay?.consume);
  console.info('[sach-staging-history-archive]',JSON.stringify(result));
  if(replay){
   const comparison = await replay.verify(
    path=>dashboard.fetch(new Request('https://sach-staging.internal'+path),env,ctx),
    finals=>saveWorkerFinalCorrections(env.VINEXT_KV_CACHE,scope.sport,scope.day,finals),
   );
   console.info('[sach-staging-grading-replay]',JSON.stringify({...scope,...comparison}));
  }
 },
};
