/** Restore/check a frozen artifact locally. This entry point cannot upload. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {prepareR1} from './prepare-r1-release.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const stabilityRelease=join(app,'releases/r1-stability-2026-11-24');
const sha=b=>createHash('sha256').update(b).digest('hex');
export function prepareStabilityRelease(output=join(app,'.cloudflare/output/v0')){
 const manifest=JSON.parse(readFileSync(join(stabilityRelease,'manifest.json')));
 const inventory=readFileSync(join(stabilityRelease,'files.json'));
 if(sha(inventory)!==manifest.allFileChecksumsSha256)throw Error('stability_inventory_digest_mismatch');
 const sourceInputs=readFileSync(join(stabilityRelease,'source-inputs.json'));
 if(sha(sourceInputs)!==manifest.sourceInputsSha256)throw Error('stability_source_inventory_mismatch');
 for(const input of JSON.parse(sourceInputs)){
  if(input.path.startsWith('/')||input.path.split('/').includes('..'))throw Error('stability_source_path_rejected');
  const bytes=readFileSync(join(app,input.path));
  if(bytes.length!==input.bytes||sha(bytes)!==input.sha256)throw Error('stability_source_input_mismatch');
 }
 const result=prepareR1(output,stabilityRelease);
 for(const file of JSON.parse(inventory)){
  if(file.path.startsWith('/')||file.path.split('/').includes('..'))throw Error('stability_inventory_path_rejected');
  const bytes=readFileSync(join(output,file.path));
  if(bytes.length!==file.bytes||sha(bytes)!==file.sha256)throw Error('stability_file_digest_mismatch');
 }
 return {...result,artifact:manifest.artifact,sourceInputFilesVerified:JSON.parse(sourceInputs).length,scope:'stability_only_model_holds_retained'};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==3||!['--prepare-only','--dry-run'].includes(process.argv[2]))
  throw Error('Use --prepare-only or --dry-run; uploading requires separate approval.');
 console.info('[r1-stability-frozen-artifact]',JSON.stringify(prepareStabilityRelease()));
 if(process.argv[2]==='--dry-run')execFileSync(process.execPath,[join(app,'scripts/deploy-cloudflare.mjs'),'--dry-run'],{cwd:app,stdio:'inherit'});
}
