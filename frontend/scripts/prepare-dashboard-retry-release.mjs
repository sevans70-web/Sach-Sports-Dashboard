/** Prepare or dry-run a frozen candidate. This entry point deliberately cannot upload. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const release=join(app,'releases/dashboard-retry-2026-11-15');
const sha=x=>createHash('sha256').update(x).digest('hex');
const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
export function fingerprint(output){
 const base=join(output,'workers/default'),config=JSON.parse(readFileSync(join(base,'worker.config.json'))),files=[];
 if(config.name!=='sach-sports-cloudflare-test'||config.limits?.subrequests!==350||config.compatibilityDate!=='2026-11-06'||config.env?.DASHBOARD_JOBS?.exportName!=='DashboardJobQueue'||config.exports?.DashboardJobQueue?.storage!=='sqlite'||config.env?.VINEXT_KV_CACHE?.id!=='644df6a469e84dba90c8f7dac410f895')throw Error('release_configuration_mismatch');
 const walk=dir=>{for(const entry of readdirSync(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())walk(path);else if(!entry.isFile())throw Error('release_symlink_rejected');else if(!path.endsWith('.map')){if(path.includes('local-runtime-test'))throw Error('test_control_in_release');const bytes=readFileSync(path);files.push({path:relative(base,path).replaceAll('\\','/'),bytes:bytes.length,sha256:sha(bytes)});}}};
 walk(join(base,'bundle'));walk(join(base,'assets'));files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const build=JSON.parse(readFileSync(join(output,'config.json')));if(build.buildContext?.isPreview!==false||build.buildContext?.mode!=='production')throw Error('release_build_context_mismatch');
 return {digest:sha(JSON.stringify(ordered({config,files}))),files:files.length,worker:config.name};
}
export function prepare(output=join(app,'.cloudflare/output/v0')){
 const manifest=JSON.parse(readFileSync(join(release,'manifest.json'))),archive=join(release,'candidate.tar.gz');
 if(manifest.status!=='awaiting_user_approval'||sha(readFileSync(archive))!==manifest.archive.sha256)throw Error('release_manifest_or_archive_mismatch');
 const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');if(names.some(n=>n.startsWith('/')||n.split('/').includes('..')))throw Error('unsafe_archive');
 rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',output]);const result=fingerprint(output);if(result.digest!==manifest.bundleDigest)throw Error('release_digest_mismatch');return {...result,sourceCommit:manifest.sourceCommit,approvalRequired:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];if(process.argv.length!==3||!['--prepare-only','--dry-run'].includes(mode))throw Error('Use --prepare-only or --dry-run. Upload requires separate user approval.');
 console.info('[dashboard-retry-artifact]',JSON.stringify(prepare()));if(mode==='--dry-run')execFileSync(process.execPath,[join(app,'scripts/deploy-cloudflare.mjs'),'--dry-run'],{cwd:app,stdio:'inherit'});
}
