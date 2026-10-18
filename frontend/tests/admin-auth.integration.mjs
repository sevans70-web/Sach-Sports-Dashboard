// Run after a production build: node --test tests/admin-auth.integration.mjs
// All Auth responses come from a local mock, never the production account.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
const email='sachsportsplatform@gmail.com';
const user={id:'00000000-0000-4000-8000-000000000001',email,email_confirmed_at:new Date().toISOString(),role:'authenticated',aud:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
const jwt=payload=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({exp:Math.floor(Date.now()/1000)+3600,sub:user.id,role:'authenticated',...payload})).toString('base64url')+'.test-signature';
const access=jwt({email}),outsider=jwt({email:'tester@example.test'});
let sentEmail=null;
const provider=http.createServer(async(req,res)=>{
 let text='';for await(const chunk of req)text+=chunk;
 const body=text?JSON.parse(text):{};res.setHeader('content-type','application/json');
 const send=(status,data)=>{res.statusCode=status;res.end(JSON.stringify(data));};
 if(req.url.startsWith('/auth/v1/settings'))return send(200,{external:{email:true}});
 if(req.url.startsWith('/auth/v1/user')){
  const token=req.headers.authorization?.replace('Bearer ','');
  if(![access,outsider].includes(token))return send(401,{message:'Invalid token'});
  return send(200,token===access?user:{...user,email:'tester@example.test'});
 }
 if(req.url.startsWith('/auth/v1/token')){
  if(body.password!=='correct-test-password'&&body.refresh_token!=='test-refresh')return send(400,{error:'invalid_grant',error_description:'Invalid credentials'});
  return send(200,{access_token:access,refresh_token:'test-refresh',expires_in:3600,token_type:'bearer',user});
 }
 if(req.url.startsWith('/auth/v1/otp')){sentEmail=body.email;return send(200,{});}
 if(req.url.startsWith('/auth/v1/logout'))return send(200,{});
 if(req.url.startsWith('/rest/'))return send(200,[]);
 return send(404,{});
});
test('production routes enforce admin authentication, safe cookies and request origin',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sach-admin-test-'));
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 await mkdir(path.join(dir,'nba'));
 const fixture=['hit','miss','push','void'].map((status,i)=>({key:'test-'+i,playerId:String(i+1),playerName:'Test player '+i,teamName:'Test team',gameDate:day,gameTime:day+'T15:00:00Z',market:'points',matchup:'A @ B',savedAt:day+'T12:00:00Z',status,actual:[12,9,10,null][i],sportsbookLine:10,pickSide:'OVER'}));
 for(let i=0;i<101;i++)fixture.push({...fixture[0],key:'extra-'+i,playerId:'extra-'+i});
 await writeFile(path.join(dir,'nba',`points_${day}.json`),JSON.stringify(fixture));
 await new Promise(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const providerPort=provider.address().port;
 const reserve=http.createServer();await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));const port=reserve.address().port;await new Promise(resolve=>reserve.close(resolve));
 const base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{cwd:new URL('..',import.meta.url),env:{...process.env,NODE_ENV:'production',SUPABASE_URL:`http://127.0.0.1:${providerPort}`,SUPABASE_KEY:'test-server-api-key',SUPABASE_SECRET_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',SACH_HISTORY_DIR:dir,RAILWAY_PUBLIC_DOMAIN:''},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
 const request=(url,options={})=>fetch(base+url,{redirect:'manual',...options});
 const post=(payload,headers={Origin:base})=>request('/api/admin/auth',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
 try{
  let ready=false;for(let i=0;i<100;i++){try{if((await request('/admin/login')).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready,output);
  assert.equal((await request('/admin')).status,307);
  const readiness=await request('/api/admin/auth');assert.equal(readiness.status,401);assert.equal((await readiness.json()).configured,true);
  for(const route of ['/api/admin/records','/api/admin/overview'])assert.equal((await request(route)).status,401);
  assert.equal((await post({action:'password',email,password:'correct-test-password'},{})).status,403);
  assert.equal((await post({action:'password',email,password:'correct-test-password'},{Origin:'https://evil.example'})).status,403);
  assert.equal((await post({action:'password',email:'sevans70@hotmail.com',password:'correct-test-password'})).status,403);
  assert.equal((await post({action:'password',email,password:'incorrect'})).status,401);
  const login=await post({action:'password',email,password:'correct-test-password'});assert.equal(login.status,200);
  const setCookies=login.headers.getSetCookie();assert.equal(setCookies.length,2);for(const c of setCookies){assert.match(c,/HttpOnly/i);assert.match(c,/Secure/i);assert.match(c,/SameSite=strict/i);}
  const cookie=setCookies.map(c=>c.split(';')[0]).join('; ');
  assert.equal((await request('/admin',{headers:{Cookie:cookie}})).status,200);
  const status=await request('/api/admin/auth',{headers:{Cookie:cookie}});assert.equal((await status.json()).authenticated,true);
  const overview=await request('/api/admin/overview',{headers:{Cookie:cookie}});assert.equal(overview.status,200);assert.match(overview.headers.get('cache-control'),/no-store/);
  assert.equal((await request('/api/admin/overview',{headers:{Cookie:`sach-admin-access=${outsider}`}})).status,401);
  const callback=await post({action:'callback',accessToken:outsider,refreshToken:'test-refresh'});assert.equal(callback.status,401);
  const refreshed=await request('/api/admin/auth',{headers:{Cookie:'sach-admin-refresh=test-refresh','Sec-Fetch-Site':'same-origin'}});assert.equal(refreshed.status,200);assert.equal(refreshed.headers.getSetCookie().length,2);
  const records=await request('/api/admin/records?sport=nba&period=Today',{headers:{Cookie:cookie}});assert.equal(records.status,200);const inspected=await records.json();assert.deepEqual(inspected.counts,{total:105,hits:102,misses:1,pushes:1,settled:104,pending:0,void:1,unknown:0,hitRate:99});assert.equal(inspected.records.find(r=>r.status==='hit').actual,12);assert.equal(inspected.records.find(r=>r.status==='miss').side,'OVER');assert.equal(inspected.records.find(r=>r.status==='miss').verifiedPick,false);
  assert.equal((await request('/api/admin/records?sport=mlb',{headers:{Cookie:cookie}})).status,400);
  const password=await request('/api/admin/password',{method:'POST',headers:{Origin:base,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({password:'new-local-test-password'})});assert.equal(password.status,200);
  const otp=await post({action:'email',email});assert.equal(otp.status,200);assert.equal(sentEmail,email);
  const html=await(await request('/admin',{headers:{Cookie:cookie}})).text();assert.equal(html.includes('test-server-api-key'),false);
  const logout=await post({action:'logout'},{Origin:base,Cookie:cookie});assert.equal(logout.status,200);assert.ok(logout.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
 }finally{child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));await new Promise(resolve=>provider.close(resolve));await rm(dir,{recursive:true,force:true});}
});
