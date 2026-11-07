import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {dirname,join} from 'node:path';import {createRequire} from 'node:module';
import {allowApiSettingsUpdate} from '../scripts/deploy-cloudflare.mjs';
test('deployment compatibility skips only API provenance while retaining strict config checks',()=>{
 const require=createRequire(import.meta.url),root=dirname(require.resolve('cf/package.json'));
 const file=readdirSync(join(root,'dist')).find(f=>/^deploy-input-.*\.mjs$/.test(f));const source=readFileSync(join(root,'dist',file),'utf8');
 const result=allowApiSettingsUpdate(source);
 assert.equal(result.replace('skipLastDeployedFromApiCheck:!0','skipLastDeployedFromApiCheck:!1'),source);
 assert.ok(result.includes('strict:!0'));assert.throws(()=>allowApiSettingsUpdate('unknown cli version'),/review deployment/i);
});
