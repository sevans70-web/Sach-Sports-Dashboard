/** A stalled history refresh must settle so saved results remain usable. */
export async function fetchHistoryJson(url:string,signal:AbortSignal,timeoutMs=10000){
 const response=await fetch(url,{cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)])});
 if(!response.ok)throw new Error(`Performance request failed: ${response.status}`);
 return response.json();
}
