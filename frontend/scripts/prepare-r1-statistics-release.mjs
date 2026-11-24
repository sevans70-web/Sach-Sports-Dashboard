/** Local frozen-package restore/dry-run only. No upload mode. */
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {prepareR1} from './prepare-r1-release.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const statisticsRelease=join(app,'releases/r1-2026-11-23-statistics');
export const prepareStatisticsRelease=output=>prepareR1(output,statisticsRelease);
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||!['--prepare-only','--dry-run'].includes(process.argv[2]))
  throw Error('Use --prepare-only or --dry-run; this updated artifact requires separate approval before uploading.');
 console.info('[r1-statistics-frozen-artifact]',JSON.stringify(prepareStatisticsRelease()));
 if(process.argv[2]==='--dry-run')execFileSync(process.execPath,[join(app,'scripts/deploy-cloudflare.mjs'),'--dry-run'],{cwd:app,stdio:'inherit'});
}
