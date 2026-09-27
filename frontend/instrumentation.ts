declare global { var __sachAllSportHistoryTimer:boolean|undefined }
export async function register(){
 if(process.env.NEXT_RUNTIME!=="nodejs"||globalThis.__sachAllSportHistoryTimer)return;
 globalThis.__sachAllSportHistoryTimer=true;
 const port=process.env.PORT||"3000",base=`http://127.0.0.1:${port}`;
 const run=async()=>{try{const r=await fetch(`${base}/api/history/capture`,{cache:"no-store"});if(!r.ok)console.error("[all-sport-history] capture HTTP",r.status)}catch(e){console.error("[all-sport-history]",e instanceof Error?e.message:String(e))}};
 setTimeout(run,30_000);setInterval(run,5*60_000);
}
