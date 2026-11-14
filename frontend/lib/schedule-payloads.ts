/** A failed/malformed schedule day is unknown, never a confirmed empty date.
 * Read every requested date successfully before publishing a replacement slate.
 * Existing client snapshots remain visible when this rejects. No history writes. */
export async function schedulePayloads<T>(requests:Promise<T>[],label:string,valid:(value:T)=>boolean):Promise<T[]>{
 const results=await Promise.allSettled(requests);
 const failed=results.filter(r=>r.status==='rejected'||!valid(r.value)).length;
 if(failed)throw Error(`${label} schedule incomplete (${failed}/${requests.length} dates unavailable); retrying`);
 return results.map(r=>(r as PromiseFulfilledResult<T>).value);
}
