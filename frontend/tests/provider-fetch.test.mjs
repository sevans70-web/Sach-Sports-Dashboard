import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
const source=await readFile(new URL('../lib/provider-fetch.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {providerFetch,nullableNumber}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('missing values are not fabricated zeroes',()=>{
 for(const value of [null,undefined,'',' ',false,NaN,'not a stat'])assert.equal(nullableNumber(value),null);
 for(const value of [0,'0'])assert.equal(nullableNumber(value),0);
 assert.equal(nullableNumber('12.5'),12.5);
});
test('public feed requests collapse and cached bodies remain independently readable',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;await new Promise(r=>setTimeout(r,10));return Response.json({events:[{id:1}]})};
 try{
  const url='https://site.api.espn.com/apis/site/v2/test/cache';
  const responses=await Promise.all([providerFetch(url),providerFetch(url)]);
  assert.deepEqual(await responses[0].json(),await responses[1].json());
  assert.deepEqual(await (await providerFetch(url)).json(),{events:[{id:1}]});assert.equal(calls,1);
 }finally{globalThis.fetch=original}
});
test('ESPN failure retries the official alternate host; failed responses are never cached',async()=>{
 const original=globalThis.fetch;const calls=[];
 globalThis.fetch=async(input)=>{calls.push(String(input));return String(input).includes('site.web.api')?Response.json({events:[]}):new Response('Forbidden',{status:403})};
 try{
  const r=await providerFetch('https://site.api.espn.com/apis/site/v2/test/fallback');
  assert.equal(r.status,200);assert.equal(calls.length,2);assert.match(calls[1],/site.web.api.espn.com/);
  let failures=0;globalThis.fetch=async()=>{failures++;return new Response('unavailable',{status:503})};
  const url='https://api-web.nhle.com/test/failure';
  assert.equal((await providerFetch(url)).status,503);assert.equal((await providerFetch(url)).status,503);assert.equal(failures,2);
 }finally{globalThis.fetch=original}
});
test('authenticated sportsbook requests are not cached or sent to alternate hosts',async()=>{
 const original=globalThis.fetch;let calls=0;
 globalThis.fetch=async(input,init)=>{calls++;assert.equal(new URL(String(input)).hostname,'api.owlsinsight.com');assert.equal(init.headers.Authorization,'Bearer test');assert.ok(init.signal);return new Response('Forbidden',{status:403})};
 try{for(let i=0;i<2;i++)assert.equal((await providerFetch('https://api.owlsinsight.com/test',{headers:{Authorization:'Bearer test'}})).status,403);assert.equal(calls,2)}finally{globalThis.fetch=original}
});
