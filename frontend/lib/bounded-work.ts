/** Small request-independent admission queue. Work starts in the caller's async context. */
export class WorkQueueBusy extends Error{retryAfterMs=1000;constructor(){super('work_queue_busy');}}
export function boundedWork(limit=1,maxQueued=8,waitMs=15000){
 let active=0,peak=0;const queue:{resolve:()=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}[]=[];
 return {status:()=>({active,queued:queue.length,peak}),async run<T>(work:()=>Promise<T>):Promise<T>{
  if(active>=limit){if(queue.length>=maxQueued)throw new WorkQueueBusy();await new Promise<void>((resolve,reject)=>{const entry={resolve,reject,timer:setTimeout(()=>{const at=queue.indexOf(entry);if(at>=0){queue.splice(at,1);reject(new WorkQueueBusy());}},waitMs)};queue.push(entry);});}else active++;
  peak=Math.max(peak,active);
  try{return await work();}finally{const next=queue.shift();if(next){clearTimeout(next.timer);next.resolve();}else active--;}
 }};
}
