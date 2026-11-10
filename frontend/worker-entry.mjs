import dashboard from 'vinext/server/fetch-handler';
import {PREGAME_MARKETS,PREGAME_CAPTURE_CRON,PREGAME_GRADE_CRON,scheduledPregameCapture} from './scripts/worker-pregame-capture.mjs';
import {gradeSavedWorkerPicks} from './scripts/worker-pregame-grade.mjs';
import {createWorkerGradingReplay} from './lib/worker-grading-replay';
import {saveWorkerFinalCorrections} from './lib/worker-final-observations';
import {archiveWorkerHistoryDay,workerHistoryBackupScope,readWorkerRecentReplayDay} from './scripts/worker-history-backup.mjs';
import {archiveWorkerPregameDay} from './scripts/worker-pregame-backup.mjs';

/** Run bounded official FINAL replay after the existing pregame cron.
 * The 2-minute cron belongs to PREGAME_CAPTURE_CRON, so routing recent
 * replay only in the 'unknown cron' fallback meant it NEVER executed. */
async function recentReplayTick(env,ctx,scheduledTime){
 const scope=workerHistoryBackupScope(scheduledTime,true);
 const replay=createWorkerGradingReplay(scope.sport);
 try{
  const source=await readWorkerRecentReplayDay(env,scope,replay.consume);
  console.info('[sach-staging-grading-source]',JSON.stringify(source));
  const comparison=await replay.verify(
   path=>dashboard.fetch(new Request('https://sach-staging.internal'+path),env,ctx),
   finals=>saveWorkerFinalCorrections(env.VINEXT_KV_CACHE,scope.sport,scope.day,finals),
   Math.floor(scheduledTime/(6*60_000)),
  );
  console.info('[sach-staging-grading-replay]',JSON.stringify({...scope,...comparison}));
 }catch(error){
  console.error('[sach-staging-grading-replay-failed]',error instanceof Error?error.message:'replay failed');
 }
}

export * from 'vinext/server/fetch-handler';

export default {
 ...dashboard,
 async scheduled(controller,env,ctx){
  if(controller.cron===PREGAME_CAPTURE_CRON||controller.cron==='*/5 * * * *'){
   try{
    const report=await scheduledPregameCapture(env,dashboard,ctx,controller.scheduledTime,controller.cron!==PREGAME_CAPTURE_CRON);
    console.info('[sach-staging-pregame-capture]',JSON.stringify(report));
   }catch(error){
    console.error('[sach-staging-pregame-capture-failed]',error instanceof Error?error.message:'capture failed');
   }
   // Use the EXISTING two-minute Cron for independent correction checks.
   // Do not add a second paid Cron, or let a capture error suppress grading.
   if(controller.cron===PREGAME_CAPTURE_CRON)await recentReplayTick(env,ctx,controller.scheduledTime);
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
  // The other configured cron handles DAILY archive of the oldest
  // retained day. Pregame+recent grading already ran in their own paths.
  if(controller.cron==='10-17 9 * * *'){
   const scope=workerHistoryBackupScope(controller.scheduledTime,false);
   try{
    const result=await archiveWorkerHistoryDay(env,scope);
    console.info('[sach-staging-history-archive]',JSON.stringify(result));
   }finally{
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
 },
};
