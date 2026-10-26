/** Railway runs a persistent Node server. Recovery must outlive the request
 * without being attached to Next's response-completion lifecycle. */
export function schedulePerformanceRecovery(work:()=>Promise<unknown>):void{
 setImmediate(()=>{void Promise.resolve().then(work).catch(error=>console.warn('[performance recovery]',error instanceof Error?error.message:'failed'));});
}
