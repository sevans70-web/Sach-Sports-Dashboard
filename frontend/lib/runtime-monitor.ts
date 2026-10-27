import {monitorEventLoopDelay,performance} from 'node:perf_hooks';
import {promises as fs} from 'node:fs';
import {startCpuSampler} from '@/lib/runtime-cpu';
/** Bounded numeric diagnostics only: no environment values or record contents. */
export function startRuntimeMonitor(root:string){
 const stopCpu=startCpuSampler();
 const delay=monitorEventLoopDelay({resolution:20});delay.enable();
 let cpu=process.cpuUsage(),last=performance.now(),busy=false,closed=false;
 const timer=setInterval(()=>{
  if(busy)return;busy=true;
  const at=performance.now(),used=process.cpuUsage(cpu);cpu=process.cpuUsage();
  const sample={windowMs:Math.round(at-last),loopMaxMs:Math.round(delay.max/1e6),loopP99Ms:Math.round(delay.percentile(99)/1e6),cpuMs:Math.round((used.user+used.system)/1000),rssMb:Math.round(process.memoryUsage().rss/1048576)};
  last=at;delay.reset();const probe=performance.now();
  void fs.stat(root).then(()=>true,()=>false).then(storageAccessible=>{
   if(!closed)console.info('[runtime-monitor]',JSON.stringify({...sample,storageProbeMs:Math.round(performance.now()-probe),storageAccessible}));
  }).finally(()=>{busy=false;});
 },10000);timer.unref();
 return ()=>{closed=true;clearInterval(timer);delay.disable();stopCpu();};
}
