import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {loadTs} from './load-ts.mjs';
const {performanceView}=await loadTs(new URL('../lib/performance-view.ts',import.meta.url));
test('saved result views coalesce cold loads and serve verified records immediately while stale results refresh',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-view-')),deferred=[];let reads=0;const now=Date.parse('2026-10-25T20:00Z');
 const reader=async()=>({records:[{status:'hit',actual:0}],coverage:{complete:false},summary:{hits:++reads}});
 try{const [a,b]=await Promise.all([performanceView('nfl','Today',w=>deferred.push(w),now,root,reader),performanceView('nfl','Today',w=>deferred.push(w),now,root,reader)]);assert.equal(reads,1);assert.equal(a.records[0].actual,0);assert.deepEqual(a,b);
 const cached=await performanceView('nfl','Today',w=>deferred.push(w),now+61000,root,reader);assert.equal(cached.summary.hits,1);assert.equal(cached.refreshing,true);assert.equal(reads,1);await deferred[0]();assert.equal(reads,2);const next=await performanceView('nfl','Today',()=>{},now+62000,root,reader);assert.equal(next.summary.hits,2);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('a failed background refresh retains the verified saved view',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-view-fail-')),deferred=[];const now=Date.parse('2026-10-25T20:00Z');
 try{await performanceView('nba','Today',()=>{},now,root,async()=>({records:[{actual:0}],coverage:{complete:true}}));const data=await performanceView('nba','Today',w=>deferred.push(w),now+61000,root,async()=>{throw Error('provider down')});assert.equal(data.records[0].actual,0);await deferred[0]();const next=await performanceView('nba','Today',()=>{},now+62000,root,async()=>{throw Error('provider down')});assert.equal(next.records[0].actual,0);}finally{await rm(root,{recursive:true,force:true});}
});
