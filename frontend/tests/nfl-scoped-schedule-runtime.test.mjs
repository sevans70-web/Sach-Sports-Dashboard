import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {rolldown} from 'rolldown';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';

const fixture=JSON.parse(gunzipSync(await readFile(new URL('./fixtures/nfl-scoreboard-2026-11-22.json.gz',import.meta.url))));
const baseline=process.env.R1_NFL_SCOPE_BASELINE==='1';
test('compiled NFL explicit-day collection survives an unrelated weekly403, without weakening full-week completeness',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nfl-day-scope-'));let mf;const calls=[];
 try{
  await writeFile(join(dir,'entry.mjs'),`
import {getEspnNflSchedule} from '${resolve('lib/nfl-server.ts')}';
const NativeDate=Date,clock=${Date.parse(fixture.capturedAt)};
globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[clock]))}static now(){return clock}};
export default{async fetch(r){try{return Response.json({games:await getEspnNflSchedule(new URL(r.url).searchParams.get('day')||undefined)})}catch(e){return Response.json({error:e.message},{status:503})}}};
`);
  const build=await rolldown({input:join(dir,'entry.mjs'),platform:'neutral',external:['cloudflare:workers',/^node:/],plugins:[{name:'aliases',resolveId(id){if(id.startsWith('@/'))return resolve(id.slice(2)+'.ts')},transform(_code,id){if(baseline&&id===resolve('lib/nfl-server.ts'))return execFileSync('git',['show','1c567c1:frontend/lib/nfl-server.ts'],{encoding:'utf8'});}}]});await build.write({file:join(dir,'worker.mjs'),format:'esm'});await build.close();
  const o=convertV4MiniflareOptions({modules:true,scriptPath:join(dir,'worker.mjs'),modulesRoot:dir,compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],outboundService:r=>{
   const u=new URL(r.url);assert.equal(r.method,'GET');assert.equal(u.origin+u.pathname,'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard');calls.push(u.searchParams.get('dates'));
   // Actual current-day source; other days are explicitly isolated contracts.
   if(u.searchParams.get('dates')==='20261122')return Response.json(fixture.payload);
   if(u.searchParams.get('dates')==='20261119')return Response.json({error:'recorded unrelated-date HTTP403'},{status:403});
   return Response.json({events:[]});
  }});o.workers[0].config.limits={subrequests:350,cpuMs:30000};mf=new Miniflare(o);
  const scoped=await mf.dispatchFetch('https://isolated.test/schedule?day=2026-11-22'),body=await scoped.json();
  if(baseline){assert.equal(scoped.status,503);assert.match(body.error,/schedule incomplete/);assert.equal(calls.length,5);assert.ok(calls.includes('20261122'));console.log('NFL_SCOPE_BASELINE',JSON.stringify({compiledSource:'1c567c1',scopedStatus:503,currentDayGamesAvailable:fixture.payload.events.length,requests:5,unrelatedDateDenialBlocksCurrentDay:true,productionAccess:false}));return;}
  assert.equal(scoped.status,200,JSON.stringify(body));assert.equal(body.games.length,fixture.payload.events.length);assert.deepEqual(calls,['20261122']);assert.deepEqual(body.games.map(g=>g.id).sort(),fixture.payload.events.map(g=>g.id).sort());
  calls.length=0;const weekly=await mf.dispatchFetch('https://isolated.test/schedule'),unknown=await weekly.json();assert.equal(weekly.status,503);assert.match(unknown.error,/schedule incomplete/);assert.equal(unknown.games,undefined,'unknown week cannot be a successful empty or partial slate');assert.equal(calls.length,4,'the already verified current-day response is reused by the short source cache');assert.equal(calls.filter(d=>d==='20261119').length,1,'no denied-date retry');
  calls.length=0;const invalid=await mf.dispatchFetch('https://isolated.test/schedule?day=2026-02-31');assert.equal(invalid.status,503);assert.match((await invalid.json()).error,/Invalid NFL schedule day/);assert.equal(calls.length,0,'invalid scope cannot reach a source');
  console.log('NFL_SCOPED_SCHEDULE',JSON.stringify({source:fixture.source,actualCurrentDayGames:body.games.length,scopedRequests:1,unrelatedDenialRequests:0,wholeWeekFailsClosed:true,invalidDateCalls:0,CloudflareLimit:350,productionAccess:false}));
 }finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
});
