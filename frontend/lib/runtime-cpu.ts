import {Session} from 'node:inspector';
import path from 'node:path';

/** Numeric sampling summary only. Never log locals, URLs, request data or a raw profile. */
export function summarizeCpu(profile:any){
 const nodes=new Map<number,any>((profile.nodes||[]).map((n:any)=>[n.id,n.callFrame]));
 const totals=new Map<number,number>();
 for(let i=0;i<(profile.samples||[]).length;i++){
  const id=profile.samples[i],delta=profile.timeDeltas?.[i]||0;
  totals.set(id,(totals.get(id)||0)+delta);
 }
 return [...totals].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([id,us])=>{
  const frame=nodes.get(id)||{};
  return {name:String(frame.functionName||'(anonymous)').slice(0,100),file:path.basename(String(frame.url||'').split('?')[0]),line:(frame.lineNumber??-1)+1,selfMs:Math.round(us/1000)};
 });
}

/** One bounded diagnostic run per server start, 100 samples/s for twelve windows. */
export function startCpuSampler(){
 const session=new Session();let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
 const post=(method:string,params:Record<string,unknown>={})=>new Promise<any>((resolve,reject)=>session.post(method as any,params,(error,result)=>error?reject(error):resolve(result)));
 const close=()=>{stopped=true;if(timer)clearTimeout(timer);try{session.disconnect()}catch{}};
 const run=async()=>{
  try{
   session.connect();await post('Profiler.enable');await post('Profiler.setSamplingInterval',{interval:10000});
   for(let window=0;window<12&&!stopped;window++){
    await post('Profiler.start');
    await new Promise<void>(resolve=>{timer=setTimeout(resolve,30000);timer.unref();});
    if(stopped)break;
    const {profile}=await post('Profiler.stop');
    console.info('[runtime-cpu]',JSON.stringify({window,durationMs:Math.round((profile.endTime-profile.startTime)/1000),top:summarizeCpu(profile)}));
   }
  }catch(error){console.warn('[runtime-cpu] sampler unavailable',error instanceof Error?error.name:'Error');}
  finally{close();}
 };
 void run();return close;
}
