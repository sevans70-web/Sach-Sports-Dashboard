/** Prepare the exact new R1 artifact locally. There is deliberately no upload mode. */
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {prepareR1} from './prepare-r1-release.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const durableRelease=join(app,'releases/r1-2026-11-17-durable');
export const prepareDurableR1=output=>prepareR1(output,durableRelease);
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||!['--prepare-only','--dry-run'].includes(process.argv[2]))throw Error('Use --prepare-only or --dry-run; upload requires separate approval.');
 console.info('[r1-durable-frozen-artifact]',JSON.stringify(prepareDurableR1()));
 if(process.argv[2]==='--dry-run')execFileSync(process.execPath,[join(app,'scripts/deploy-cloudflare.mjs'),'--dry-run'],{cwd:app,stdio:'inherit'});
}
