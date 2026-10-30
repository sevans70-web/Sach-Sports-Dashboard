import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {researchOfficialResults,officialResult} from '../scripts/p01-official-results.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('offline official results reject corrupted bytes, conflicting IDs and changed payloads',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'p01-official-'));
 try{
  const data={header:{id:'7',competitions:[{date:'2026-10-29T00:00:00Z',status:{type:{completed:true}}}]}};
  const record={id:'7',url:'https://official.test/7',data,sha256:hash(JSON.stringify(data))};
  const save=async records=>{const b=gzipSync(JSON.stringify(records));await writeFile(dir+'/official-results.json.gz',b);await writeFile(dir+'/receipt.json',JSON.stringify({files:{'official-results.json.gz':hash(b)}}));};
  await save([record]);const archive=await researchOfficialResults(dir);assert.deepEqual(await officialResult('7',record.url,archive),record);
  await assert.rejects(officialResult('8',record.url,archive),/unavailable/);await assert.rejects(officialResult('7','https://other.test/7',archive),/unavailable/);
  await writeFile(dir+'/official-results.json.gz','changed');await assert.rejects(researchOfficialResults(dir),/checksum/);
  await save([record,record]);await assert.rejects(researchOfficialResults(dir),/Ambiguous/);
  await save([{...record,data:{header:{id:'8'}}}]);await assert.rejects(researchOfficialResults(dir),/checksum\/identity/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
