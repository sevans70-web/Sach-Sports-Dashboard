import {GET as nfl} from '../../app/api/nfl/rankings/route.ts';
import {GET as nhl} from '../../app/api/nhl/rankings/route.ts';
import {GET as nba} from '../../app/api/nba/rankings/route.ts';
import {NextRequest,withinRequest} from './ranking-framework.mjs';
import {dashboardJobClass} from '../../jobs/coordinator.mjs';
let now=Date.parse('2026-11-15T11:02:00Z');const NativeDate=Date;
globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
const dashboard={fetch(request,env,ctx){return withinRequest(ctx,()=>{const sport=new URL(request.url).pathname.split('/')[2];return ({nfl,nhl,nba})[sport](new NextRequest(request));});}};
const Base=dashboardJobClass({dashboard,publish:async(env,sport,market,body)=>env.VINEXT_KV_CACHE.put('published:'+sport+':'+market,JSON.stringify(body)),createReplay:()=>({consume(){},gameIds(){return[];}}),saveCorrections:async()=>{}});
export class ActualRankingQueue extends Base{
 // Deliver alarms explicitly; the historical replay clock must not trigger real-time alarms.
 async arm(){}
 now(){return this.meta('testClock')||Date.now()}
 async control(action,value){
  if(action==='enqueue')return this.enqueue(value);
  if(action==='clock'){now=value;this.setMeta('testClock',value);return this.status();}
  if(action==='step'){const due=this.rows("SELECT MIN(due) due FROM jobs WHERE state='active'")[0]?.due;this.setMeta('testClock',Math.max(this.now()+1001,(due||0)+1));now=this.now();await this.alarm();return this.status();}
  if(action==='inspect')return {status:this.status(),documents:this.rows('SELECT job,stream,body FROM documents'),events:this.rows('SELECT * FROM phase_events'),sources:this.rows('SELECT url,expires,bytes FROM source_cache')};
  throw Error('invalid_control');
 }
}
export default{fetch(request,env,ctx){if(new URL(request.url).pathname==='/control')return request.json().then(async({lane,action,value})=>Response.json(await env.DASHBOARD_JOBS.getByName(lane).control(action,value)));return dashboard.fetch(request,env,ctx);}};
