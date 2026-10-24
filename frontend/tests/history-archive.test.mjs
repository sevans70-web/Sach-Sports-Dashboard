import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('new snapshots are immutable segments and legacy UTF-8/escaped JSON archives remain byte-for-byte unchanged',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-archive-')),old=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
 const dir=path.join(root,'nba','archive');await mkdir(dir,{recursive:true});const file=path.join(dir,'points_2026-10-24.json');
 const legacy=JSON.stringify([{capturedAt:'2026-10-24T10:00Z',hash:'old',payload:{text:'é🏀 {"escaped": "} \\\""}',padding:'a'.repeat(70000)}}]);await writeFile(file,legacy);
 const api=await loadTs(new URL('../lib/history-archive.ts',import.meta.url));
 await Promise.all([api.appendHistorySnapshot('nba','points',{value:0},'2026-10-24'),api.appendHistorySnapshot('nba','points',{value:2},'2026-10-24')]);
 assert.equal(await readFile(file,'utf8'),legacy);const read=await api.readHistorySnapshots('nba','points','2026-10-24');assert.equal(read.length,3);assert.deepEqual(read.slice(1).map(r=>r.payload.value),[0,2]);
 assert.equal((await api.appendHistorySnapshot('nba','points',{value:2},'2026-10-24')).written,false);
 let count=0;await api.visitHistorySnapshots('nba','points','2026-10-24',()=>count++);assert.equal(count,3);
 }finally{if(old===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=old;await rm(root,{recursive:true,force:true});}
});
