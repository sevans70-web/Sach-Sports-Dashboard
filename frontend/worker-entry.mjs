import {workerPerformanceServices} from './lib/worker-performance-build';
import {ensureFetchPatch} from 'vinext/shims/fetch-cache';
import {recoverNbaCachedBoard} from './lib/nba-cached-recovery';
import {nbaEvMarket} from './lib/nba-ranking-ev';
import {nflRankingPayload} from './lib/nfl-ranking-display';
import dashboard from 'vinext/server/fetch-handler';
import {cachePregameBoard,readPregameBoard} from './lib/ranking-board-cache';
import {recordRankingMarket} from './lib/ranking-market-coverage';
import {PREGAME_MARKETS,PREGAME_CAPTURE_CRON,PREGAME_GRADE_CRON} from './scripts/worker-pregame-capture.mjs';
import {dashboardJobClass,enqueueDashboardTick} from './jobs/coordinator.mjs';
import {createWorkerGradingReplay} from './lib/worker-grading-replay';
import {saveWorkerFinalCorrections} from './lib/worker-final-observations';
import {archiveWorkerHistoryDay,workerHistoryBackupScope} from './scripts/worker-history-backup.mjs';
import {archiveWorkerPregameDay} from './scripts/worker-pregame-backup.mjs';

// Install framework transport before request-local job accounting wraps it.
// Lazy installation during the first ranking request would replace the guard.
ensureFetchPatch();

export const DashboardJobQueue=dashboardJobClass({dashboard,performance:workerPerformanceServices,createReplay:createWorkerGradingReplay,saveCorrections:saveWorkerFinalCorrections,
 publish:(env,sport,market,body)=>Promise.all([cachePregameBoard(env.VINEXT_KV_CACHE,sport,market,body),recordRankingMarket(env.VINEXT_KV_CACHE,sport,market,body)]),
});

export * from 'vinext/server/fetch-handler';

export default {
 ...dashboard,
 async fetch(request,env,ctx){
  const url=new URL(request.url),match=url.pathname.match(/^\/api\/(nba|nfl|nhl)\/rankings$/);
  const sport=match?.[1],market=url.searchParams.get('market');
  const day=url.searchParams.get('day'),slate=url.searchParams.get('slate');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(new Date());
  const publicBoard=request.method==='GET'&&sport&&market&&!['tomorrow','previous'].includes(slate);
  if(publicBoard&&sport==='nba'&&nbaEvMarket(market)){
   const cacheDay=!day||day==='today'?today:day;
   if(/^\d{4}-\d{2}-\d{2}$/.test(cacheDay)){
    const cached=await recoverNbaCachedBoard(env.VINEXT_KV_CACHE,market,cacheDay,Date.now(),{activeScope:!day,cacheFirst:true});
    if(cached)return Response.json(cached,{headers:{'Cache-Control':'no-store'}});
   }
  }
  if(publicBoard&&sport==='nfl'&&/^\d{4}-\d{2}-\d{2}$/.test(day||'')&&day>=today){
   const cached=await readPregameBoard(env.VINEXT_KV_CACHE,sport,market,day);
   if(cached?.pregameOnly)return Response.json(nflRankingPayload(cached.board),{headers:{'Cache-Control':'no-store'}});
  }
  const response=await dashboard.fetch(request,env,ctx);
  // A provider failure may return HTTP200 with no eligible NBA rows. Do not
  // discard a still-valid cache receipt merely because this refresh failed.
  if(publicBoard&&sport==='nba'){
   const body=response.ok?await response.clone().json().catch(()=>null):null;
   if(!response.ok||body?.success===false||body?.rows?.length===0){
    const recoveryDay=!day||day==='today'?today:day;
    if(/^\d{4}-\d{2}-\d{2}$/.test(recoveryDay)){
     const recovered=await recoverNbaCachedBoard(env.VINEXT_KV_CACHE,market,recoveryDay);
     if(recovered)return Response.json(recovered,{headers:{'Cache-Control':'no-store'}});
    }
   }
  }
  if(publicBoard&&response.ok){
   ctx.waitUntil(response.clone().json().then(body=>Promise.all([
    cachePregameBoard(env.VINEXT_KV_CACHE,sport,market,body),
    // Default navigation has a separate short-lived key. A scheduled or
    // explicit-day board cannot replace its known active-slate identity.
    sport==='nba'&&nbaEvMarket(market)&&!day&&!slate?cachePregameBoard(env.VINEXT_KV_CACHE,'nba-active',market,body):null,
    !day||day==='today'||day===today?recordRankingMarket(env.VINEXT_KV_CACHE,sport,market,body):null,
   ])).catch(error=>console.error('[ranking cache write]',sport,market,error instanceof Error?error.message:'unavailable')));
  }
  return response;
 },
 async scheduled(controller,env,ctx){
  if([PREGAME_CAPTURE_CRON,'*/5 * * * *',PREGAME_GRADE_CRON].includes(controller.cron)){
   const queued=await enqueueDashboardTick(controller,env);
   console.info('[dashboard-job-enqueued]',JSON.stringify(queued));
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
