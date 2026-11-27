import {AsyncLocalStorage} from 'node:async_hooks';
import {boundedWork} from '@/lib/bounded-work';
import {dashboardJobContext} from '@/lib/dashboard-job-context';
const context=new AsyncLocalStorage<{signal:AbortSignal}>(),admission=boundedWork(1,8,15000);
export function nbaRankingSignal(signal?:AbortSignal){const scope=context.getStore();return scope?AbortSignal.any([scope.signal,...(signal?[signal]:[])]):signal;}
export function assertNbaRankingActive(){const signal=context.getStore()?.signal;if(signal?.aborted)throw signal.reason;}
/** A timed-out caller never releases the memory slot while its build still runs. */
export async function runNbaRankingWork<T>(build:()=>Promise<T>,caller?:AbortSignal,timeoutMs=25000):Promise<T>{
 if(dashboardJobContext())return build();
 const deadline=AbortSignal.timeout(timeoutMs),signal=caller?AbortSignal.any([caller,deadline]):deadline;
 signal.throwIfAborted();
 let onAbort:()=>void=()=>{};
 const cancelled=new Promise<never>((_,reject)=>{
  onAbort=()=>reject(signal.reason);
  signal.addEventListener('abort',onAbort,{once:true});
 });
 const work=admission.run(()=>context.run({signal},async()=>{
  assertNbaRankingActive();const value=await build();assertNbaRankingActive();return value;
 }));
 try{return await Promise.race([work,cancelled]);}
 finally{signal.removeEventListener('abort',onAbort);}
}
