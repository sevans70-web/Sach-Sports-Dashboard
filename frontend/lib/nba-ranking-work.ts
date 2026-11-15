import {AsyncLocalStorage} from 'node:async_hooks';
import {boundedWork} from '@/lib/bounded-work';
const context=new AsyncLocalStorage<{signal:AbortSignal}>(),admission=boundedWork(1,8,15000);
export const nbaRankingWorkStatus=()=>admission.status();
export function nbaRankingSignal(signal?:AbortSignal){const scope=context.getStore();return scope?AbortSignal.any([scope.signal,...(signal?[signal]:[])]):signal;}
export function assertNbaRankingActive(){const signal=context.getStore()?.signal;if(signal?.aborted)throw signal.reason;}
/** A timed-out caller never releases the memory slot while its build still runs. */
export async function runNbaRankingWork<T>(build:()=>Promise<T>,timeoutMs=25000):Promise<T>{
 const abort=new AbortController();let timer:ReturnType<typeof setTimeout>;
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{const error=Error('nba_ranking_deadline');abort.abort(error);reject(error);},timeoutMs);});
 const work=admission.run(()=>context.run({signal:abort.signal},async()=>{assertNbaRankingActive();const value=await build();assertNbaRankingActive();return value;}));
 void work.finally(()=>clearTimeout(timer)).catch(()=>{});
 return Promise.race([work,deadline]);
}
