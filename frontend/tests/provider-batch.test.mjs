import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {successfulPayloads}=await loadTs(new URL('../lib/provider-batch.ts',import.meta.url));
test('a failed schedule provider cannot masquerade as a successful zero-game slate',async()=>{await assert.rejects(successfulPayloads([Promise.reject(Error('offline'))],'Test'),/temporarily unavailable/)});
test('partial schedule coverage retains valid payloads including a genuinely empty day',async()=>{assert.deepEqual(await successfulPayloads([Promise.resolve({events:[]}),Promise.reject(Error('offline')),Promise.resolve({events:[1]})],'Test'),[{events:[]},{events:[1]}])});
