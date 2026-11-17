/** Extract the corrected, tested R1 bytes; never build or upload. */
import {execFileSync} from 'node:child_process';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareR1} from './prepare-r1-release.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const correctedRelease=join(app,'releases/r1-2026-11-17');
export const prepareCorrectedR1=output=>prepareR1(output,correctedRelease);
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];
 if(process.argv.length!==3||!['--prepare-only','--dry-run'].includes(mode))throw Error('Use --prepare-only or --dry-run; uploading requires separate approval.');
 console.info('[r1-corrected-frozen-artifact]',JSON.stringify(prepareCorrectedR1()));
 if(mode==='--dry-run')execFileSync(process.execPath,[join(app,'scripts/deploy-cloudflare.mjs'),'--dry-run'],{cwd:app,stdio:'inherit'});
}
