/** Refresh credentials for long-running archives; request bodies must be replayable. */
export function driveAuth({clientId,clientSecret,refreshToken,fetchImpl=fetch,now=Date.now}){
 let token='',expiresAt=0,inflight;
 async function refresh(){
  if(inflight)return inflight;
  inflight=(async()=>{
   const r=await fetchImpl('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'})});
   if(!r.ok)throw Error('Google OAuth refresh failed: HTTP '+r.status);
   const p=await r.json();if(!p.access_token)throw Error('Google OAuth did not return an access token');
   token=p.access_token;expiresAt=now()+Math.max(1,Number(p.expires_in)||3600)*1000;
  })().finally(()=>{inflight=undefined});
  return inflight;
 }
 async function request(url,options={}){
  if(!token||now()>=expiresAt-60000)await refresh();
  const sentToken=token;
  const send=()=>{const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+token);return fetchImpl(url,{...options,headers})};
  let response=await send();
  if(response.status===401){
   await response.body?.cancel();
   if(token===sentToken)await refresh();
   response=await send();
  }
  return response;
 }
 return {request};
}
