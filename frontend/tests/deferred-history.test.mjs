import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {loadTs} from './load-ts.mjs';
test('a response saves original local evidence before scheduling cloud replication and recent misses do not query cloud',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sach-deferred-'));process.env.SACH_HISTORY_DIR=root;process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('must not block response')};
 try{const api=await loadTs(new URL('../lib/durable-history.ts',import.meta.url)),tasks=[];
 assert.deepEqual(await api.readDurableHistory('nba','missing','2026-10-25',true),[]);assert.equal(calls,0);
 assert.equal(await api.writeDurableHistory('nba','slate_board_points','2026-10-25',[{original:'pregame'}],task=>tasks.push(task)),true);
 assert.equal(calls,0);assert.equal(tasks.length,1);assert.deepEqual(JSON.parse(await readFile(join(root,'nba','slate_board_points_2026-10-25.json'),'utf8')),[{original:'pregame'}]);
 }finally{globalThis.fetch=original;delete process.env.SACH_HISTORY_DIR;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;await rm(root,{recursive:true,force:true})}
});
