import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTs} from './load-ts.mjs';

test('concurrent local writes remain valid while cloud replication is blocked',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sach-history-'));
 const previous={root:process.env.SACH_HISTORY_DIR,url:process.env.SUPABASE_URL,key:process.env.SUPABASE_SECRET_KEY,fetch:globalThis.fetch};
 process.env.SACH_HISTORY_DIR=root;process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
 let release;const blocked=new Promise(resolve=>release=resolve);let calls=0;
 globalThis.fetch=async()=>{calls++;await blocked;throw Error('cloud unavailable')};
 try{
  const api=await loadTs(new URL('../lib/durable-history.ts',import.meta.url));
  const writes=Array.from({length:20},(_,value)=>api.writeDurableHistory('nfl','featured_receiving_yards','2026-10-25',[{value}]));
  while(calls<20)await new Promise(resolve=>setImmediate(resolve));
  const rows=JSON.parse(await readFile(join(root,'nfl','featured_receiving_yards_2026-10-25.json'),'utf8'));
  assert.equal(rows.length,1);assert.ok(Number.isInteger(rows[0].value));
  assert.equal((await readdir(join(root,'nfl'))).filter(f=>f.endsWith('.tmp')).length,0);
  release();assert.ok((await Promise.all(writes)).every(Boolean));
 }finally{
  release();globalThis.fetch=previous.fetch;
  for(const [name,value] of [['SACH_HISTORY_DIR',previous.root],['SUPABASE_URL',previous.url],['SUPABASE_SECRET_KEY',previous.key]])if(value===undefined)delete process.env[name];else process.env[name]=value;
  await rm(root,{recursive:true,force:true});
 }
});
