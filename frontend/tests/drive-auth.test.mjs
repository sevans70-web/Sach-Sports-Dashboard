import test from 'node:test';
import assert from 'node:assert/strict';
import {driveAuth} from '../scripts/drive-auth.mjs';
test('long backups renew expiring tokens and replay one rejected upload with identical bytes',async()=>{
 let time=0,refreshes=0,reject=false;const requests=[];
 const auth=driveAuth({clientId:'id',clientSecret:'secret',refreshToken:'refresh',now:()=>time,fetchImpl:async(url,options)=>{
  if(url.includes('oauth2'))return Response.json({access_token:'token'+(++refreshes),expires_in:3600});
  requests.push({auth:options.headers.get('Authorization'),body:options.body});
  if(reject){reject=false;return new Response('',{status:401})}return Response.json({ok:true});
 }});
 await auth.request('https://www.googleapis.com/drive/v3/files');time=3600000;
 await Promise.all([auth.request('https://www.googleapis.com/drive/v3/files'),auth.request('https://www.googleapis.com/drive/v3/files')]);
 assert.equal(refreshes,2);reject=true;const body=Buffer.from('original archive');
 const result=await auth.request('https://www.googleapis.com/upload',{method:'PUT',body});
 assert.equal(result.status,200);assert.equal(refreshes,3);assert.equal(requests.at(-1).auth,'Bearer token3');assert.equal(requests.at(-1).body,body);assert.equal(requests.at(-2).body,body);
});
test('invalid refresh credentials stop writes instead of hiding authentication failure',async()=>{
 const auth=driveAuth({fetchImpl:async()=>new Response('',{status:400})});await assert.rejects(auth.request('https://www.googleapis.com/drive/v3/files'),/OAuth refresh failed/);
});
