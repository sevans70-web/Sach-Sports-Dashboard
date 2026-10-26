import test from 'node:test';import assert from 'node:assert/strict';import {setImmediate as tick} from 'node:timers/promises';import {loadTs} from './load-ts.mjs';
const {schedulePerformanceRecovery}=await loadTs(new URL('../lib/performance-recovery-scheduler.ts',import.meta.url));
test('persistent recovery is detached and a stalled provider cannot hold request completion',async()=>{
 let started=false,finished=false,release;const gate=new Promise(r=>release=r);
 assert.equal(schedulePerformanceRecovery(async()=>{started=true;await gate;finished=true;}),undefined);assert.equal(started,false);
 await tick();assert.equal(started,true);assert.equal(finished,false);await tick();assert.equal(finished,false);release();await tick();assert.equal(finished,true);
});
