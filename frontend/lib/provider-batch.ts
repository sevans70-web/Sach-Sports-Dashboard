/** Partial schedule coverage is useful; a completely failed feed is not an empty slate. */
export async function successfulPayloads<T>(requests:Promise<T>[],label:string):Promise<T[]>{
 const results=await Promise.allSettled(requests),good=results.flatMap(r=>r.status==="fulfilled"?[r.value]:[]);
 if(!good.length)throw new Error(`${label} schedule is temporarily unavailable`);
 return good;
}
