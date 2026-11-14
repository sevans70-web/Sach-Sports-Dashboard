import test from 'node:test';import assert from 'node:assert/strict';import {encodeShadowArtifacts,decodeShadowArtifacts} from '../scripts/cw08-cloudflare-artifacts.mjs';
test('Cloudflare shadow export roundtrips public evidence and detects tampering',()=>{
 const files=[{path:'receipts/goals-123-456.json',content:JSON.stringify({production:false,quote:{line:.5,overPrice:200,underPrice:-240}})}];
 const e=encodeShadowArtifacts(files);assert.deepEqual(decodeShadowArtifacts(e),files);assert.ok(e.chunks.every(c=>c.length<=3000));assert.throws(()=>decodeShadowArtifacts({...e,sha256:'changed'}),/checksum/);
});
test('Cloudflare shadow export refuses credentials and path traversal',()=>{
 const secret='synthetic-test-credential';assert.throws(()=>encodeShadowArtifacts([{path:'bundle.json',content:secret}],[secret]),/Secret detected/);
 assert.throws(()=>encodeShadowArtifacts([{path:'../escape.json',content:'{}'}]),/path/);
});
