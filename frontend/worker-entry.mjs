import dashboard from 'vinext/server/fetch-handler';
import {verifyWorkerDriveBackup} from './scripts/worker-backup-probe.mjs';

export * from 'vinext/server/fetch-handler';

export default {
 ...dashboard,
 async scheduled(_controller,env){
  const result = await verifyWorkerDriveBackup(env);
  console.info('[sach-staging-backup-verified]',JSON.stringify(result));
 },
};
