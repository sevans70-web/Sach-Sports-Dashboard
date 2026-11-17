/** Offline frozen-Worker rehearsal of explicitly captured current public data.
 * No live fetch, credential read, production binding or data write is allowed. */
import {readFile,readdir,mkdtemp,writeFile,rm,cp} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {loadTs} from '../tests/load-ts.mjs';
const [bundleArg,inputArg,outputArg]=process.argv.slice(2);
if(!bundleArg||!inputArg||!outputArg||process.argv.length!==5)throw Error('Use: node check-r1-current-nba.mjs BUNDLE CAPTURE_DIRECTORY REPORT.json');
const input=resolve(inputArg),manifest=JSON.parse(await readFile(join(input,'current-history-manifest.json'),'utf8'));
const now=Date.parse(manifest.finishedAt),sources=new Map();
for(const receipt of manifest.receipts){
 if(receipt.status!==200||!/^[a-f0-9]{64}\.json$/.test(receipt.file||''))continue;
 const body=await readFile(join(input,'sources',receipt.file),'utf8');
 if(createHash('sha256').update(body).digest('hex')!==receipt.sha256)throw Error('captured_source_checksum_mismatch');
 sources.set(receipt.source,{body,observedAt:receipt.observedAt});
}
const markets=['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts'];
const {selectNbaCandidates}=await loadTs(new URL('../lib/nba-ranking-candidates.ts',import.meta.url));
const dir=await mkdtemp(join(tmpdir(),'r1-current-nba-'));let mf;
try{
 await cp(resolve(bundleArg),dir,{recursive:true});const files=(await readdir(dir,{recursive:true})).filter(p=>p.endsWith('.js')),forecast=files.find(p=>/live-model-forecast-/.test(p));
 if(!forecast)throw Error('compiled_forecast_module_missing');
 await writeFile(join(dir,'current-input-test.mjs'),`import {t as attach} from './${forecast}';export {DashboardJobQueue} from './index.js';const NativeDate=Date;globalThis.Date=class extends NativeDate{constructor(...a){super(...(a.length?a:[${now}]))}static now(){return ${now}}};export default{async fetch(r){return Response.json(await attach(await r.json(),'nba',Date.now()));}};`);
 const calls=[];const opts=convertV4MiniflareOptions({modules:[{type:'ESModule',path:join(dir,'current-input-test.mjs')},...files.map(p=>({type:'ESModule',path:join(dir,p)}))],modulesRoot:dir,compatibilityDate:'2026-11-06',compatibilityFlags:['nodejs_compat'],durableObjects:{DASHBOARD_JOBS:{className:'DashboardJobQueue',useSQLite:true}},kvNamespaces:['VINEXT_KV_CACHE'],bindings:{SUPABASE_URL:'https://isolated-test.supabase.co',SUPABASE_SECRET_KEY:'synthetic-test-only'},outboundService:request=>{
  if(request.method!=='GET')throw Error('current_coverage_test_forbids_writes');
  const url=new URL(request.url);calls.push(request.url);
  if(url.hostname==='isolated-test.supabase.co')return Response.json([]);
  const source=sources.get(request.url);if(!source)throw Error('uncaptured_source_request:'+url.pathname);
  return new Response(source.body,{headers:{'Content-Type':'application/json','x-sach-observed-at':source.observedAt}});
 }});opts.workers[0].config.limits={subrequests:350,cpuMs:30000};mf=new Miniflare(opts);
 const results=[];
 for(const market of markets){
  const payload=JSON.parse(await readFile(join(input,'nba-'+market+'.json'),'utf8'));
  const start=performance.now(),before=calls.length,response=await mf.dispatchFetch('https://isolated.test/current',{method:'POST',body:JSON.stringify(payload)}),body=await response.json();
  if(response.status!==200)throw Error('compiled_current_forecast_failed:'+market+':'+JSON.stringify(body));
  const visible=selectNbaCandidates(body.rows||[],market,now),coverage=body.officialHistoryCoverage;
  results.push({market,inputRows:payload.rows.length,stillFreshQuotes:(body.rows||[]).filter(r=>Date.parse(r.quoteUpdatedAt)<=now&&now-Date.parse(r.quoteUpdatedAt)<=15*60000).length,displayable:visible.length,fitted:body.fittedResearchForecastCount,blockers:body.forecastBlockers,unavailablePlayers:coverage?.unavailable??null,sourceBudget:coverage?.sourceBudget,sourceEvidence:coverage?.sourceEvidence,sourceHttpReads:calls.length-before,elapsedMs:Math.round(performance.now()-start)});
 }
 const report={scope:'Actual frozen compiled forecast module in workerd; current captured sportsbook rows and actual ESPN source responses replayed offline; not production candidate acceptance',snapshotAt:manifest.finishedAt,capturedPlayers:manifest.players,capturedFixtures:manifest.recentFixtures,capturedHttp200:manifest.receipts.filter(r=>r.status===200).length,productionAccess:false,limits:{subrequests:350,cpuMs:30000},results,allSevenHaveSupportedRankings:results.every(r=>r.displayable>0)};
 await writeFile(resolve(outputArg),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,results:results.map(({sourceEvidence,...r})=>r)}));
}finally{await mf?.dispose();await rm(dir,{recursive:true,force:true});}
