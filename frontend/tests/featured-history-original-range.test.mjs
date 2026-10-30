import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {loadTs} from './load-ts.mjs';
const originals=await loadTs(new URL('../lib/featured-originals.ts',import.meta.url));
const source=await readFile(new URL('../lib/featured-history-days.ts',import.meta.url),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const day='2026-10-29',card={key:'long',pick:{price:550,row:{playerId:'original',gameTime:'2026-10-29T20:00Z',sportsbook:'Original Book',quoteId:'original-quote'}}};
function load(fail=false){
 const calls=[];const exports={};
 const modules={
  '../scripts/history-cloud.mjs':{cloudConfigured:()=>true,readCloudDocumentRange:async(sport,stream,from,to)=>{
   calls.push({sport,stream,from,to});if(fail&&stream==='protected_featured_original_long')throw Error('unavailable');
   return stream==='protected_featured_original_long'?[{game_date:day,payload:[{savedAt:'2026-10-29T13:00Z',payload:card}]}]:[];
  }},
  '@/lib/durable-history':{readDurableHistory:async()=>[]},
  '@/lib/featured-originals':originals
 };
 vm.runInNewContext(code,{exports,require:name=>{assert.ok(modules[name],name);return modules[name]}});
 return {read:exports.featuredHistoryDays,calls};
}
test('cold featured history recovers immutable category receipts with five bounded stream-range reads',async()=>{
 const {read,calls}=load();const result=await read('nfl',['2026-10-28',day]);
 assert.equal(result.complete,true);assert.deepEqual(JSON.parse(JSON.stringify(result.boards)),[{day:'2026-10-28',choices:[]},{day,choices:[card]}]);
 assert.equal(calls.length,5);assert.ok(calls.every(c=>c.sport==='nfl'&&c.from==='2026-10-28'&&c.to===day));
 assert.deepEqual(calls.map(c=>c.stream),originals.FEATURED_STREAMS);
});
test('failed protected-original range is explicitly incomplete and never creates a replacement',async()=>{
 const {read}=load(true);const result=await read('nfl',[day]);
 assert.equal(result.complete,false);assert.equal(result.boards[0].choices.length,0);
});
