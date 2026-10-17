const locks=new Map<string,Promise<unknown>>();
export async function withHistoryLock<T>(key:string,work:()=>Promise<T>):Promise<T>{
 const before=locks.get(key)||Promise.resolve(),next=before.catch(()=>{}).then(work);locks.set(key,next);
 try{return await next}finally{if(locks.get(key)===next)locks.delete(key)}
}
