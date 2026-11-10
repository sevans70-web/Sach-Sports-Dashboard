import dashboard from 'vinext/server/fetch-handler';
import {PREGAME_MARKETS,PREGAME_CAPTURE_CRON,PREGAME_GRADE_CRON,scheduledPregameCapture} from './scripts/worker-pregame-capture.mjs';
import {gradeSavedWorkerPicks} from './scripts/worker-pregame-grade.mjs';
import {createWorkerGradingReplay} from './lib/worker-grading-replay';
import {saveWorkerFinalCorrections} from './lib/worker-final-observations';
import {archiveWorkerHistoryDay,workerHistoryBackupScope,readWorkerRecentReplayDay} from './scripts/worker-history-backup.mjs';
import {archiveWorkerPregameDay} from './scripts/worker-pregame-backup.mjs';

export * from 'vinext/server/fetch-handler';

export default {
 ...dashboard,
 async scheduled(controller,env,ctx){
  if(controller.cron===PREGAME_CAPTURE_CRON||controller.cron==='*/5 * * * *'){
   const report=await scheduledPregameCapture(env,dashboard,ctx,controller.scheduledTime,controller.cron!==PREGAME_CAPTURE_CRON);
   console.info('[sach-staging-pregame-capture]',JSON.stringify(report));
   return;
  }
  if(controller.cron===PREGAME_GRADE_CRON){
   try{
    const settled=await gradeSavedWorkerPicks(env,dashboard,ctx,controller.scheduledTime);
    console.info('[sach-staging-original-grades]',JSON.stringify(settled));
   }catch(error){
    console.error('[sach-staging-original-grades-failed]',error instanceof Error?error.message:'grading failed');
   }
   return;
  }
  // Temporary date-bound staging triggers check a recent completed day.
  // The daily schedule archives the oldest retained day before it ages out.
  const recent = controller.cron !== '10-17 9 * * *';
  const scope = workerHistoryBackupScope(controller.scheduledTime,recent);
  const replay = recent ? createWorkerGradingReplay(scope.sport) : null;
  if(recent){
   // Frequent grading checks must not perform 2-minute Drive uploads.
   // Read checksum-verified yesterday originals and prior FINALs only.
   try{
    const source=await readWorkerRecentReplayDay(env,scope,replay.consume);
    console.info('[sach-staging-grading-source]',JSON.stringify(source));
   }catch(error){
    console.error('[sach-staging-grading-source-failed]',error instanceof Error?error.message:'read failed');
    return;
   }
  }else{
   try{
    const result=await archiveWorkerHistoryDay(env,scope);
    console.info('[sach-staging-history-archive]',JSON.stringify(result));
   }finally{
    // Back up original picks/quotes even if legacy history archive fails.
    if(Object.hasOwn(PREGAME_MARKETS,scope.sport)){
     try{
      const backup=await archiveWorkerPregameDay(env,scope);
      console.info('[sach-staging-pregame-backup]',JSON.stringify(backup));
     }catch(error){
      console.error('[sach-staging-pregame-backup-failed]',error instanceof Error?error.message:'backup failed');
     }
    }
   }
  }
  if(replay){
   const comparison = await replay.verify(
    path=>dashboard.fetch(new Request('https://sach-staging.internal'+path),env,ctx),
    finals=>saveWorkerFinalCorrections(env.VINEXT_KV_CACHE,scope.sport,scope.day,finals),
    // One sport is revisited roughly every 16 minutes. Rotate its game batch
    // on that cadence, rather than on every 2-minute global cron tick.
    Math.floor(controller.scheduledTime / (16 * 60_000)),
   );
   console.info('[sach-staging-grading-replay]',JSON.stringify({...scope,...comparison}));
  }
 },
};
