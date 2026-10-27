import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {summarizeCpu}=await loadTs(new URL('../lib/runtime-cpu.ts',import.meta.url));
test('CPU diagnostics aggregate sample weights and expose no profile variables or URL parameters',()=>{
 const result=summarizeCpu({nodes:[{id:1,callFrame:{functionName:'recover',url:'/app/private/chunk.js?secret=value',lineNumber:9}},{id:2,callFrame:{functionName:'(idle)',url:'',lineNumber:-1}}],samples:[1,2,1],timeDeltas:[5000,1000,9000],privateData:'must not appear'});
 assert.deepEqual(result,[{name:'recover',file:'chunk.js',line:10,selfMs:14},{name:'(idle)',file:'',line:0,selfMs:1}]);
 assert.equal(JSON.stringify(result).includes('secret'),false);assert.deepEqual(summarizeCpu({}),[]);
});
