/** Prefetch observers may ignore failures; foreground consumers must still
 * receive the original rejection so they retain cards and retry normally. */
export function sharedJsonRequest<T>(pending:Map<string,Promise<T>>,key:string,read:()=>Promise<T>){
 const previous=pending.get(key);if(previous)return previous;
 const work=Promise.resolve().then(read).finally(()=>{if(pending.get(key)===work)pending.delete(key)});
 pending.set(key,work);return work;
}
