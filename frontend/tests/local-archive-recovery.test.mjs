import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {loadTs} from './load-ts.mjs';
test('local recovery reaches immutable segments when legacy file is missing and cloud is unavailable',async()=>{
 const root=await mkdtemp(join(tmpdir(),'nfl-lock-')),old=process.env.SACH_HISTORY_DIR,fetch=globalThis.fetch;process.env.SACH_HISTORY_DIR=root;let calls=0;
 globalThis.fetch=async()=>{calls++;throw Error('cloud down')};
 try{const api=await loadTs(new URL('../lib/history-archive.ts',import.meta.url));await api.appendHistorySnapshot('nfl','receiving_yards',{kind:'research_rankings',market:'receiving_yards',rows:[{playerId:'original'}]},'2026-10-25');const rows=[];await api.visitHistorySnapshots('nfl','receiving_yards','2026-10-25',s=>rows.push(s),true);assert.equal(rows[0].payload.rows[0].playerId,'original');assert.equal(calls,0)}
 finally{globalThis.fetch=fetch;if(old===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=old;await rm(root,{recursive:true,force:true})}
});
