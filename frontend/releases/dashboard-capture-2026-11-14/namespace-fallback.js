/** Stage-1 and emergency fallback: preserve state, hold all new job work. */
import dashboard,{DashboardJobQueue as ApprovedQueue} from './index.js';
export * from './index.js';
export class DashboardJobQueue extends ApprovedQueue{
 async alarm(){
  console.info('[dashboard-release-hold]',JSON.stringify({kind:'alarm',reason:'fallback_verified_before_capture_activation'}));
  // Keep the alarm recoverable on a subsequent approved candidate activation.
  // Do not advance a cursor, replace a reservation, or write a pick/grade.
  await this.ctx.storage.setAlarm(Date.now()+60000);
 }
}
export default{
 ...dashboard,
 async scheduled(controller,env,ctx){
  if(['*/2 * * * *','*/5 * * * *','0,30 * * * *'].includes(controller.cron)){
   console.info('[dashboard-release-hold]',JSON.stringify({kind:'scheduled',cron:controller.cron,reason:'fallback_verified_before_capture_activation'}));return;
  }
  return dashboard.scheduled(controller,env,ctx);
 }
};
