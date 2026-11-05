import {readFile} from 'node:fs/promises';import ts from 'typescript';
import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
test('public provider cache is byte-bounded, expires old bodies, and never requires response stream cloning',async()=>{
 const {providerFetch,providerCacheStatus}=await loadTs(new URL('../lib/provider-fetch.ts',import.meta.url));
 const source=await readFile(new URL('../lib/provider-fetch.ts',import.meta.url),'utf8');
 const alternate=await import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(source+'\n// second route bundle',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
 const oldFetch=globalThis.fetch,oldNow=Date.now;let calls=0;const large='x'.repeat(1024*1024);
 globalThis.fetch=async()=>{calls++;const r=new Response(large);r.clone=()=>{throw Error('must not tee an unread provider body')};return r;};
 try{
  const responses=await Promise.all([providerFetch('https://api-web.nhle.com/cache/shared'),alternate.providerFetch('https://api-web.nhle.com/cache/shared')]);assert.equal(calls,1);assert.equal((await responses[0].text()).length,large.length);assert.equal((await responses[1].text()).length,large.length);
  for(let i=0;i<24;i++)await (await providerFetch('https://api-web.nhle.com/cache/'+i)).text();
  const status=providerCacheStatus();assert.ok(status.bytes<=status.maxBytes);assert.ok(status.entries<24);assert.equal(status.pending,0);
  const clock=oldNow();Date.now=()=>clock+16*60000;globalThis.fetch=async()=>new Response(null,{status:204});
  assert.equal((await providerFetch('https://api-web.nhle.com/empty')).status,204);assert.equal(providerCacheStatus().bytes,0);
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow;}
});
test('hidden dashboard polling makes zero requests and visibility resumes immediately with full cleanup',async()=>{
 const {visiblePolling}=await loadTs(new URL('../lib/visible-polling.ts',import.meta.url));
 const oldSet=globalThis.setInterval,oldClear=globalThis.clearInterval;let tick,listener,calls=0,cleared=false;
 const doc={hidden:true,addEventListener:(_,fn)=>{listener=fn},removeEventListener:(_,fn)=>{assert.equal(listener,fn);listener=null}};
 globalThis.setInterval=fn=>{tick=fn;return 42};globalThis.clearInterval=id=>{assert.equal(id,42);cleared=true};
 try{const stop=visiblePolling(()=>calls++,15000,doc);tick();tick();listener();assert.equal(calls,0);doc.hidden=false;listener();assert.equal(calls,1);tick();assert.equal(calls,2);doc.hidden=true;tick();assert.equal(calls,2);stop();assert.equal(listener,null);assert.equal(cleared,true);}
 finally{globalThis.setInterval=oldSet;globalThis.clearInterval=oldClear;}
});
