import test from 'node:test';import assert from 'node:assert/strict';import {promises as fs} from 'node:fs';import path from 'node:path';import os from 'node:os';import {createHash} from 'node:crypto';
import {previewManifest,verifiedFullArchive,retentionPreview} from '../scripts/retention-preview.mjs';
test('all-sport retention preview preserves boundaries; completed manifest required; dry run never deletes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'sach-preview-')),files=[];
 try{
 for(const sport of ['nba','nfl','cfb','nhl','mlb','wnba','soccer','cbb']){const rel=`sach-history/${sport}/points_2026-10-20.json`;await fs.mkdir(path.dirname(path.join(root,rel)),{recursive:true});await fs.writeFile(path.join(root,rel),'[]');files.push({path:rel,bytes:2});}
 const manifest={files,sourcePaths:files.map(f=>f.path),errors:[],unverifiedSourcePaths:[]};assert.equal(previewManifest(manifest,new Date('2026-10-27T03:00Z')).candidates,0);const next=previewManifest(manifest,new Date('2026-10-27T16:00Z'));assert.equal(next.candidates,8);assert.ok(Object.values(next.bySport).every(n=>n===1));
 const dir=path.join(root,'sach-history/_system');await fs.mkdir(dir,{recursive:true});const body=JSON.stringify(manifest);await fs.writeFile(path.join(dir,'backup-manifest.json'),body);const status={status:'COMPLETE',scope:'full-volume',errors:[],manifest:{files:8,md5:createHash('md5').update(body).digest('hex')}};await fs.writeFile(path.join(dir,'last-backup.json'),JSON.stringify(status));assert.equal(await verifiedFullArchive(root),true);
 const report=await retentionPreview(root,new Date('2026-10-27T16:00Z'));assert.equal(report.liveExpiredBytes,16);assert.equal(report.deleted,0);for(const f of files)assert.equal(await fs.readFile(path.join(root,f.path),'utf8'),'[]');
 await fs.writeFile(path.join(dir,'last-backup.json'),JSON.stringify({...status,status:'RUNNING'}));assert.equal(await verifiedFullArchive(root),false);await fs.writeFile(path.join(dir,'last-backup.json'),JSON.stringify(status));await fs.appendFile(path.join(dir,'backup-manifest.json'),' ');assert.equal(await verifiedFullArchive(root),false);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
