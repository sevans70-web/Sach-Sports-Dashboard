/** Exhaust a pool with bounded provider concurrency and stable order. */
export async function mapCandidatePool<T,R>(rows:T[],enrich:(row:T)=>Promise<R>):Promise<R[]>{
 const out=new Array<R>(rows.length);let next=0;
 await Promise.all(Array.from({length:Math.min(8,rows.length)},async()=>{
  while(next<rows.length){const index=next++;out[index]=await enrich(rows[index]);}
 }));return out;
}
export function rollingFootballRows(saved:any[],fresh:any[],key:(row:any)=>string,now=Date.now()){
 const started=(r:any)=>['in','post','live','final'].includes(r.gameState)||Date.parse(r.gameTime)<=now;
 const retained=saved.filter(started),ids=new Set(retained.map(key));
 return [...fresh.filter(r=>!started(r)&&!ids.has(key(r))).slice(0,25).map((r,i)=>({...r,rank:i+1})),...retained];
}
