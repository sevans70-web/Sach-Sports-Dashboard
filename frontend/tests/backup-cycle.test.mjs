import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
const md5=bytes=>createHash('md5').update(bytes).digest('hex');
test('actual backup cycle records verified uploads and skips, and never completes a failed walk',async()=>{
 const keys=['RAILWAY_VOLUME_MOUNT_PATH','BACKUP_DRIVE_FOLDER_ID','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN','SACH_BACKUP_ORPHANS_ONLY','SACH_ENABLE_BACKUP_PRUNE'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]])),oldFetch=globalThis.fetch,oldExit=process.exitCode;
 const root=await mkdtemp(path.join(tmpdir(),'sach-backup-'));
 try{
  Object.assign(process.env,{RAILWAY_VOLUME_MOUNT_PATH:root,BACKUP_DRIVE_FOLDER_ID:'parent',GOOGLE_OAUTH_CLIENT_ID:'id',GOOGLE_OAUTH_CLIENT_SECRET:'secret',GOOGLE_OAUTH_REFRESH_TOKEN:'token',SACH_BACKUP_ORPHANS_ONLY:'0',SACH_ENABLE_BACKUP_PRUNE:'0'});
  await mkdir(path.join(root,'sach-history','_system'),{recursive:true});await writeFile(path.join(root,'a.json'),'new');await writeFile(path.join(root,'b.json'),'saved');for(const name of ['c','d','e','f','g'])await writeFile(path.join(root,name+'.json'),name);
  await mkdir(path.join(root,'sach-history/_system/protected-outbox'),{recursive:true});await writeFile(path.join(root,'sach-history/_system/protected-outbox/job.json'),'{"target":"receipt"}');
  await mkdir(path.join(root,'sach-history/nba'),{recursive:true});await writeFile(path.join(root,'sach-history/nba/protected_pregame_test_2026-10-26.json'),'[{"original":true}]');
  let failWalk=false;const uploaded=new Map(),sessions=new Map();let sequence=0,active=0,peak=0;
  globalThis.fetch=async(url,options={})=>{
   const u=new URL(url);
   if(u.hostname==='oauth2.googleapis.com')return Response.json({access_token:'valid',expires_in:3600});
   if(options.method==='POST'&&u.pathname.includes('/upload/')){const id='upload'+(++sequence),metadata=JSON.parse(options.body);sessions.set(id,metadata);if(metadata.name==='a.json')await writeFile(path.join(root,'a.json'),'changed after snapshot');return new Response(null,{status:200,headers:{location:'https://www.googleapis.com/session/'+id}});}
   if(options.method==='PUT'){
    active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,10));active--;
    const id=u.pathname.split('/').at(-1),metadata=sessions.get(id),bytes=Buffer.from(options.body??'');uploaded.set(metadata.name,bytes);
    return Response.json({id,name:metadata.name,size:String(bytes.length),md5Checksum:md5(bytes)});
   }
   const q=u.searchParams.get('q')||'';
   if(q.includes("name contains 'railway-'"))return Response.json({files:[{id:'backup',name:'railway-2026',mimeType:'application/vnd.google-apps.folder'}]});
   if(q.includes('mimeType ='))return Response.json({files:[{id:'subdir',name:'folder',mimeType:'application/vnd.google-apps.folder'}]});
   if(failWalk)return new Response('listing failed',{status:503});
   return Response.json({files:[{id:'existing',name:'b.json',size:'5',md5Checksum:md5('saved'),mimeType:'application/json'}]});
  };
  await import('../scripts/backup-to-drive.mjs?complete');
  let status=JSON.parse(await readFile(path.join(root,'sach-history/_system/last-backup.json'),'utf8'));
  assert.equal(status.status,'COMPLETE');assert.equal(status.files,8);assert.ok(peak>=2&&peak<=4);assert.equal(status.deleted,0);assert.equal(status.scope,'full-volume');assert.ok(status.manifest.driveFileId);
  const manifestName=[...uploaded.keys()].find(n=>n.startsWith('backup-manifest-')),body=uploaded.get(manifestName),manifest=JSON.parse(body);
  assert.equal(status.manifest.md5,md5(body));assert.equal(status.manifest.sourceFiles,8);assert.equal(status.manifest.unverifiedSourceFiles,0);assert.deepEqual(manifest.unverifiedSourcePaths,[]);assert.deepEqual(manifest.sourcePaths,manifest.files.map(f=>f.path));assert.deepEqual(manifest.files.map(f=>f.path),['a.json','b.json','c.json','d.json','e.json','f.json','g.json','sach-history/nba/protected_pregame_test_2026-10-26.json']);assert.equal(manifest.files[1].driveFileId,'existing');
  assert.equal(uploaded.get('a.json').toString(),'new');assert.equal(await readFile(path.join(root,'a.json'),'utf8'),'changed after snapshot');assert.equal(await readFile(path.join(root,'b.json'),'utf8'),'saved');
  failWalk=true;await import('../scripts/backup-to-drive.mjs?failed');status=JSON.parse(await readFile(path.join(root,'sach-history/_system/last-backup.json'),'utf8'));
  assert.equal(status.status,'INCOMPLETE');assert.ok(status.errors.length);assert.equal(status.deleted,0);assert.equal(process.exitCode,1);
 }finally{globalThis.fetch=oldFetch;process.exitCode=oldExit;for(const k of keys)if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];await rm(root,{recursive:true,force:true});}
});
