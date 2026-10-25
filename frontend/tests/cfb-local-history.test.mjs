import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {loadTs} from './load-ts.mjs';
test('CFB local board recovery does not turn a missing local record into a failing remote history request',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sach-cfb-local-'));process.env.SACH_HISTORY_DIR=root;process.env.SUPABASE_URL='https://unavailable.invalid';process.env.SUPABASE_SECRET_KEY='test';const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('remote unavailable')};
 try{const {getLocalCfbPredictions}=await loadTs(new URL('../lib/cfb-history.ts',import.meta.url));assert.deepEqual(await getLocalCfbPredictions('passing_yards','2026-10-31'),[]);assert.equal(calls,0)}
 finally{globalThis.fetch=original;delete process.env.SACH_HISTORY_DIR;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;await rm(root,{recursive:true,force:true})}
});
