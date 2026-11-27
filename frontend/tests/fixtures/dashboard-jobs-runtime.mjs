import {env as importedEnv} from 'cloudflare:workers';
import {dashboardJobClass,enqueueDashboardTick} from '../../jobs/coordinator.mjs';
import {encode} from '../../jobs/budget.mjs';
export {NbaAcceptanceOperator} from '../../jobs/nba-acceptance.mjs';
const dashboard={async fetch(request,env,ctx){const u=new URL(request.url);
 if(u.pathname.includes('live-player-stats'))return fetch('https://official.test/final?'+u.searchParams);
 if(u.pathname.endsWith('/rankings')){
  const market=u.searchParams.get('market'),sport=u.pathname.split('/')[2];
  const source=await fetch('https://fixture.test/config?market='+market+'&sport='+sport).then(r=>r.json());
  for(let i=0;i<(source.histories||0);i++)await fetch('https://api-web.nhle.com/v1/player/'+(1000+i)+'/game-log/20262027/2').then(r=>r.json());
  await importedEnv.VINEXT_KV_CACHE.get('probe');
  if(source.defer)ctx.waitUntil(fetch('https://api-web.nhle.com/v1/player/9999/game-log/20262027/2').then(r=>r.json()));
  return Response.json(source.board??{success:true,rows:source.rows||[]});
 }return Response.json({ok:true});}};
const Base=dashboardJobClass({dashboard,createReplay:()=>({consume(){},gameIds(){return[];}}),saveCorrections:async()=>{},publish:async(env,sport,market,body)=>env.VINEXT_KV_CACHE.put('board:'+sport+':'+market,JSON.stringify(body))});
export class DashboardJobQueue extends Base{
 now(){return this.meta('testNow')||Date.now();}
 async test(action,value){if(action==='clock'){this.setMeta('testNow',value);return this.status();}
  if(action==='step'){const due=this.rows("SELECT MIN(due) AS due FROM jobs WHERE state='active'")[0]?.due||0;this.setMeta('testNow',Math.max(this.now()+1001,due+1));await this.alarm();return this.status();}
  if(action==='alarm'){await this.alarm();return this.status();}
  if(action==='readiness')return this.captureReadiness();
  if(action==='seed'){
   for(const job of value)this.sql.exec('INSERT INTO jobs VALUES(?,?,?,?,?,?,?)',
    job.id,job.kind,job.sport,job.state,job.touched,job.touched,encode(job));
   return this.status();
  }
  if(action==='clear-fixture-jobs'){this.sql.exec('DELETE FROM jobs');return this.status();}
  if(action==='in-flight-tick'){this.setMeta('unconfirmedCaptureTicks',value);return this.status();}
  if(action==='inspect')return {status:this.status(),docs:this.rows('SELECT * FROM documents'),cache:this.rows('SELECT url,expires FROM source_cache'),events:this.rows('SELECT * FROM phase_events ORDER BY id')};
  if(action==='lease'){this.setMeta('lease',value);return this.status();}throw Error('invalid_test');}
}
export default{async scheduled(controller,env){return enqueueDashboardTick(controller,env);},async fetch(request,env,ctx){const u=new URL(request.url);
 if(u.pathname==='/foreground'){await importedEnv.VINEXT_KV_CACHE.put('foreground','available');return dashboard.fetch(new Request('https://fixture.test/other'),env,ctx);}
 const {action,value,lane='capture:nhl'}=await request.json(),stub=env.DASHBOARD_JOBS.getByName(lane);
 return Response.json(action==='enqueue'?await stub.enqueue(value):await stub.test(action,value));}};
