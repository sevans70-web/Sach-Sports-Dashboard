import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';import {dirname,join} from 'node:path';import {createRequire} from 'node:module';
import {allowApiSettingsUpdate} from '../scripts/deploy-cloudflare.mjs';
test('deployment compatibility skips only API provenance while retaining strict config checks',()=>{
 const require=createRequire(import.meta.url),root=dirname(require.resolve('cf/package.json'));
 const file=readdirSync(join(root,'dist')).find(f=>/^containers-.*\.mjs$/.test(f)&&readFileSync(join(root,'dist',f),'utf8').includes('else if(l.last_deployed_from===`api`'));const source=readFileSync(join(root,'dist',file),'utf8');
 const result=allowApiSettingsUpdate(source);
 assert.equal(result.replace('else if(false&&l.last_deployed_from===`api`','else if(l.last_deployed_from===`api`'),source);
 assert.ok(result.includes('Aborting the upload operation because of conflicts'));assert.throws(()=>allowApiSettingsUpdate('unknown cli version'),/review deployment/i);
});
