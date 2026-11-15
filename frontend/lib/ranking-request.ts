/** One bounded retry; never retry an access denial or disregard a cooldown. */
export async function rankingRequest(url:string,get:typeof fetch=fetch,wait:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){
 const nba=url.startsWith('/api/nba/rankings');
 for(let attempt=0;;attempt++){
  const response=await get(url,{cache:'no-store',signal:AbortSignal.timeout(nba?30000:45000)});
  if(!nba||attempt>0||![429,502,503,504].includes(response.status))return response;
  const raw=response.headers.get('Retry-After'),seconds=raw==null?1:Number(raw);
  const delay=Number.isFinite(seconds)?seconds*1000:Date.parse(raw!)-Date.now();
  if(!Number.isFinite(delay)||delay>5000)return response;
  await response.body?.cancel();await wait(Math.max(0,delay));
 }
}
