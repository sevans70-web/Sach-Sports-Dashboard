import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,utimes,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {retentionCutoff,expiredHistory} from '../scripts/retention-policy.mjs';import {pruneVerifiedFile,md5File} from '../scripts/retention-cleanup.mjs';import {checksum} from '../scripts/history-cloud.mjs';
test('seven Toronto calendar days include today and survive midnight and DST',()=>{assert.equal(retentionCutoff(new Date('2026-10-24T02:00Z')),'2026-10-17');assert.equal(retentionCutoff(new Date('2026-10-24T16:00Z')),'2026-10-18');assert.equal(retentionCutoff(new Date('2026-11-02T04:30Z')),'2026-10-26');for(const sport of ['nba','nfl','cfb','nhl','mlb','wnba','soccer','cbb']){assert.equal(expiredHistory(`sach-history/${sport}/archive/points_2026-10-17.json`,new Date('2026-10-24T16:00Z')),true);assert.equal(expiredHistory(`sach-history/${sport}/points_2026-10-18.json`,new Date('2026-10-24T16:00Z')),false);}assert.equal(expiredHistory('sach-history/_system/manifest_2026-10-01.json'),false);assert.equal(expiredHistory('database_2026-10-01.json'),false);});
test('deletion requires a fresh remote match, readable searchable migration and catalog receipt; changing files survive',async()=>{
 const dir=await mkdtemp(path.join(tmpdir(),'sach-prune-')),full=path.join(dir,'old.json'),body='[{"actual":0}]',rel='sach-history/wnba/points_2026-10-16.json',now=new Date('2026-10-24T16:00Z');
 async function reset(){await writeFile(full,body);await utimes(full,new Date('2026-10-17'),new Date('2026-10-17'));}
 try{
 await reset();const md5=await md5File(full),remoteFile={id:'verified-copy',size:body.length,md5Checksum:md5};let recorded=0;
 const args={full,rel,size:body.length,remoteFile,now,verifyRemote:async()=>remoteFile,migrateDocument:async()=>JSON.parse(body),recordArchive:async()=>{recorded++;}};
 assert.equal(await pruneVerifiedFile({...args,verifyRemote:async()=>({...remoteFile,md5Checksum:'wrong'})}),false);assert.equal(await readFile(full,'utf8'),body);
 await assert.rejects(pruneVerifiedFile({...args,migrateDocument:async()=>{throw Error('DB unavailable')}}));assert.equal(await readFile(full,'utf8'),body);
 await assert.rejects(pruneVerifiedFile({...args,recordArchive:async()=>{throw Error('Receipt failed')}}));assert.equal(await readFile(full,'utf8'),body);
 assert.equal(await pruneVerifiedFile({...args,migrateDocument:async()=>[{gameTime:'2026-10-25T18:00Z'}]}),false);
 assert.equal(await pruneVerifiedFile({...args,recordArchive:async()=>{await writeFile(full,'changed');}}),false);
 await reset();assert.equal(await pruneVerifiedFile(args),true);assert.equal(recorded,1);await assert.rejects(readFile(full));
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('JSONB roundtrip hashing ignores key order and optional undefined fields, retaining exact zero actuals',()=>{assert.equal(checksum({b:0,a:2,optional:undefined}),checksum({a:2,b:0}));assert.notEqual(checksum({actual:0}),checksum({actual:null}));});
