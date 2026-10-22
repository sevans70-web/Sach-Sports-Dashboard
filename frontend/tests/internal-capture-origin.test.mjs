import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {internalAppOrigin}=await loadTs(new URL('../lib/internal-app-origin.ts',import.meta.url));
test('production and local capture requests use the configured instance port rather than a proxy origin',()=>{
 assert.equal(internalAppOrigin('8080'),'http://127.0.0.1:8080');
 assert.equal(internalAppOrigin('3012'),'http://127.0.0.1:3012');
 for(const port of ['0','65536','8080/path','https://other.example','NaN',''])assert.throws(()=>internalAppOrigin(port));
});
