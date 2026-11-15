/** Local-only preparation. Does not authenticate, create resources or upload. */
import {execFileSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,copyFileSync,symlinkSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';import {tmpdir} from 'node:os';import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
export const fallbackDashboard='f93184a2a421f75018c0262c7b820b5ce9d95b76';
export function prepareFallback(destination=mkdtempSync(join(tmpdir(),'sach-compatible-fallback-'))){
 const out=resolve(destination);mkdirSync(out,{recursive:true});
 const archive=execFileSync('git',['archive',fallbackDashboard,'frontend'],{cwd:root,maxBuffer:128*1024*1024});
 execFileSync('tar',['-x','-C',out],{input:archive});
 const overlays=['worker-entry.mjs','cloudflare.config.ts','jobs/budget.mjs','jobs/tasks.mjs','jobs/coordinator.mjs','lib/dashboard-job-context.ts','lib/live-quarter-forecast.ts','lib/live-quarter-observations.ts','lib/worker-grading-replay.ts','scripts/worker-history-backup.mjs','scripts/worker-pregame-capture.mjs','scripts/worker-pregame-grade.mjs'];
 for(const name of overlays){const path=join(out,'frontend',name);mkdirSync(dirname(path),{recursive:true});copyFileSync(join(root,'frontend',name),path);}
 // Preserve the deployed foreground cache implementation. Only background jobs
 // bypass its shared pending/result maps, as in the release candidate.
 const old=execFileSync('git',['show',fallbackDashboard+':frontend/lib/ranking-response-cache.ts'],{cwd:root,encoding:'utf8'});
 const marker=' const now=Date.now()';if(!old.includes(marker))throw Error('fallback cache implementation changed');
 writeFileSync(join(out,'frontend/lib/ranking-response-cache.ts'),"import {dashboardJobContext} from '@/lib/dashboard-job-context';\n"+old.replace(marker," const job=dashboardJobContext();if(job){const value=await build();job.assertActive();return value;}\n"+marker));
 const provider=execFileSync('git',['show',fallbackDashboard+':frontend/lib/provider-fetch.ts'],{cwd:root,encoding:'utf8'});
 let scopedProvider=provider.replace('  const url = String(input);',"  const job=(globalThis as typeof globalThis&{__sachDashboardJobContext?:()=>{id:string;assertActive:()=>void}|undefined}).__sachDashboardJobContext?.();job?.assertActive();\n  const url = String(input),pendingKey=(job?'dashboard-job:'+job.id+'|':'')+url;");
 for(const expression of ['pending.has(url)','pending.get(url)','pending.delete(url)','pending.set(url,work)'])scopedProvider=scopedProvider.replaceAll(expression,expression.replace('(url','(pendingKey'));
 writeFileSync(join(out,'frontend/lib/provider-fetch.ts'),scopedProvider);
 symlinkSync(join(root,'frontend/node_modules'),join(out,'frontend/node_modules'),'dir');
 const plan={dashboardBase:fallbackDashboard,overlays,foreground:'Current deployed dashboard code; only request-local background isolation added.',storage:'Same DashboardJobQueue SQLite class/schema as candidate. Never delete the namespace on rollback.',activation:'After approval only: deploy this compatible safety baseline first, verify and record its version, then deploy the NHL candidate. Stop if baseline checks fail.',rollback:'Return traffic to the recorded compatible safety baseline version. Never attempt a pre-namespace version rollback or remove historical state.'};
 writeFileSync(join(out,'fallback-plan.json'),JSON.stringify(plan,null,2)+'\n');return {directory:out,...plan};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepareFallback(process.argv[2]),null,2));
