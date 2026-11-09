import dashboard from 'vinext/server/fetch-handler';
import {createWorkerGradingReplay} from './lib/worker-grading-replay';
import {archiveWorkerHistoryDay,workerHistoryBackupScope} from './scripts/worker-history-backup.mjs';

export * from 'vinext/server/fetch-handler';

export default {
 ...dashboard,
 async scheduled(controller,env,ctx){
  // Temporary date-bound staging triggers check a recent completed day.
  // The daily schedule archives the oldest retained day before it ages out.
  const recent = controller.cron !== '10-17 9 * * *';
  const scope = workerHistoryBackupScope(controller.scheduledTime,recent);
  const replay = recent ? createWorkerGradingReplay(scope.sport) : null;
  const result = await archiveWorkerHistoryDay(env,scope,undefined,undefined,replay?.consume);
  console.info('[sach-staging-history-archive]',JSON.stringify(result));
  if(replay){
   const comparison = await replay.verify(path=>dashboard.fetch(new Request('https://sach-staging.internal'+path),env,ctx));
   console.info('[sach-staging-grading-replay]',JSON.stringify({...scope,...comparison}));
  }
 },
};
