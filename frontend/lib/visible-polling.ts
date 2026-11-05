/** Browser-only polling: capture and history schedules on the server are independent. */
export function visiblePolling(work:()=>unknown,ms:number,doc:Pick<Document,'hidden'|'addEventListener'|'removeEventListener'>=document){
 const run=()=>{if(!doc.hidden)void work();};
 const timer=setInterval(run,ms);doc.addEventListener('visibilitychange',run);
 return ()=>{clearInterval(timer);doc.removeEventListener('visibilitychange',run);};
}
