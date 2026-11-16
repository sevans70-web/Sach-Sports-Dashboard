/** Local preparation/dry-run only. Never uploads, reads secrets or changes live resources. */
import {readFileSync,mkdirSync,rmSync} from 'node:fs';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';import {resolve,dirname,join} from 'node:path';import {fileURLToPath} from 'node:url';import {fingerprint} from './prepare-dashboard-retry-release.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');export const r1Release=join(app,'releases/r1-2026-11-16');
const sha=b=>createHash('sha256').update(b).digest('hex');
export function prepareR1(output=join(app,'.cloudflare/output/v0')){
 const m=JSON.parse(readFileSync(join(r1Release,'manifest.json'))),archive=join(r1Release,'candidate.tar.gz');
 if(m.schema!=='r1-dashboard-release/v1'||!['frozen_for_rehearsal','rehearsal_blocked','rehearsal_passed_awaiting_approval'].includes(m.status)||m.worker!=='sach-sports-cloudflare-test'||m.productionDeployed!==false||m.approvalRequired!==true||m.fallbackVersion!=='a48c431a-5c3e-4491-8529-38cb20dfa898')throw Error('r1_manifest_rejected');
 if(sha(readFileSync(archive))!==m.archive.sha256)throw Error('r1_archive_digest_mismatch');
 execFileSync('git',['merge-base','--is-ancestor',m.sourceCommit,'HEAD'],{cwd:app});
 const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');if(names.some(n=>n.startsWith('/')||n.split('/').includes('..')))throw Error('r1_archive_path_rejected');
 rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',output]);const v=fingerprint(output);if(v.digest!==m.bundleDigest||v.files!==m.files)throw Error('r1_bundle_digest_mismatch');
 return {...v,sourceCommit:m.sourceCommit,archiveSha256:m.archive.sha256,approvalRequired:true,productionDeployed:false,rehearsal:m.status};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];if(process.argv.length!==3||!['--prepare-only','--dry-run'].includes(mode))throw Error('R1 supports --prepare-only or --dry-run only; uploading requires separate approval.');
 console.info('[r1-frozen-artifact]',JSON.stringify(prepareR1()));if(mode==='--dry-run')execFileSync(process.execPath,[join(app,'scripts/deploy-cloudflare.mjs'),'--dry-run'],{cwd:app,stdio:'inherit'});
}
