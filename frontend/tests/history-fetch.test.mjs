import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {fetchHistoryJson}=await loadTs(new URL('../lib/history-fetch.ts',import.meta.url));
test('a stalled history provider settles at its deadline rather than leaving the page loading',async()=>{
 const original=globalThis.fetch,keepAlive=setTimeout(()=>{},1000);
 globalThis.fetch=async(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
 try{await assert.rejects(fetchHistoryJson('/history',new AbortController().signal,15),{name:'TimeoutError'});}finally{globalThis.fetch=original;clearTimeout(keepAlive);}
});
test('history fetch retains successful payloads without changing recorded values',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response(JSON.stringify({records:[{actual:0,status:'hit'}]}));
 try{assert.deepEqual(await fetchHistoryJson('/history',new AbortController().signal),{records:[{actual:0,status:'hit'}]});}finally{globalThis.fetch=original;}
});
