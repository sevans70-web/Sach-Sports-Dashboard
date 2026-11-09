import dashboard from 'vinext/server/fetch-handler';
import {archiveWorkerHistoryDay,workerHistoryBackupScope} from './scripts/worker-history-backup.mjs';

export * from 'vinext/server/fetch-handler';

export default {
 ...dashboard,
 async scheduled(controller,env){
  // Temporary date-bound staging triggers check a recent completed day.
  // The daily schedule archives the oldest retained day before it ages out.
  const recent = controller.cron !== '10-17 9 * * *';
  const scope = workerHistoryBackupScope(controller.scheduledTime,recent);
  const result = await archiveWorkerHistoryDay(env,scope);
  console.info('[sach-staging-history-archive]',JSON.stringify(result));
 },
};
