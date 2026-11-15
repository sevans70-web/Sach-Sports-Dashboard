/** Deploy the already-approved build outputs. Never compiles the dashboard or reads credentials. */
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,rmSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
export const APPROVED_SOURCE='a949453dac8d3ae08a3feeca99dc55fe1991d267';
export const APPROVED_DIGESTS=Object.freeze({candidate:'e2021f2e35c8ec04882fa43265537d0c17d48369d4b1dd6e7233cbbff3644ead',fallback:'81ed89014b81e2acc7aeebe0494d04d27fbbb3db14381c5c6560d3270be352a8'});
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const release=join(app,'releases/dashboard-capture-2026-11-14');
export const sha=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>JSON.stringify(ordered(value));
function ordered(value){return Array.isArray(value)?value.map(ordered):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,ordered(value[k])])):value;}
function inventory(base,folder){
 const result=[];
 function visit(path){for(const entry of readdirSync(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())visit(file);else if(entry.isFile()&&!file.endsWith('.map')){if(file.includes('local-runtime-test'))throw Error('local_test_control_in_release');const body=readFileSync(file);result.push({path:relative(base,file).replaceAll('\\','/'),bytes:body.length,sha256:sha(body)});}else if(!entry.isFile())throw Error('release_symlink_rejected');}}
 visit(join(base,folder));return result.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export function verifyOutput(stage,output){
 if(!Object.hasOwn(APPROVED_DIGESTS,stage))throw Error('unknown_release_stage');
 const base=join(output,'workers/default'),config=JSON.parse(readFileSync(join(base,'worker.config.json')));
 if(config.name!=='sach-sports-cloudflare-test'||config.limits?.subrequests!==350||config.compatibilityDate!=='2026-11-06')throw Error('release_worker_configuration_mismatch');
 if(config.env?.DASHBOARD_JOBS?.exportName!=='DashboardJobQueue'||config.env.DASHBOARD_JOBS.worker!==config.name||config.exports?.DashboardJobQueue?.storage!=='sqlite')throw Error('release_queue_configuration_mismatch');
 if(config.env?.VINEXT_KV_CACHE?.id!=='644df6a469e84dba90c8f7dac410f895')throw Error('release_existing_cache_mismatch');
 const files=[...inventory(base,'bundle'),...inventory(base,'assets')];const digest=sha(canonical({config,files}));
 if(digest!==APPROVED_DIGESTS[stage])throw Error('approved_release_digest_mismatch');
 const build=JSON.parse(readFileSync(join(output,'config.json')));if(build.buildContext?.isPreview!==false||build.buildContext?.mode!=='production')throw Error('release_build_context_mismatch');
 return {stage,source:APPROVED_SOURCE,worker:config.name,digest,files:files.length};
}
export function prepareRelease(stage,output=join(app,'.cloudflare/output/v0')){
 if(!Object.hasOwn(APPROVED_DIGESTS,stage))throw Error('unknown_release_stage');
 const manifest=JSON.parse(readFileSync(join(release,'manifest.json'))),archive=join(release,stage+'.tar.gz');
 if(manifest.sourceCommit!==APPROVED_SOURCE||sha(readFileSync(archive))!==manifest.archives?.[stage]?.sha256)throw Error('release_archive_checksum_mismatch');
 const names=execFileSync('tar',['-tzf',archive],{encoding:'utf8'}).trim().split('\n');
 if(names.some(n=>n.startsWith('/')||n.split('/').includes('..')))throw Error('release_archive_path_rejected');
 rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});execFileSync('tar',['-xzf',archive,'-C',output]);
 const result=verifyOutput(stage,output);console.info('[approved-dashboard-artifact]',JSON.stringify(result));return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),stage=args[0],mode=args[1];if(args.length!==2||!['--prepare-only','--dry-run','--deploy'].includes(mode))throw Error('Use: deploy-dashboard-release.mjs fallback|candidate --prepare-only|--dry-run|--deploy');
 prepareRelease(stage);
 if(mode!=='--prepare-only')execFileSync(process.execPath,[join(app,'scripts/deploy-cloudflare.mjs'),...(mode==='--dry-run'?['--dry-run']:[]),'--tag','dashboard-capture-'+stage,'--message','Approved '+stage+'; source '+APPROVED_SOURCE+'; CW08 unchanged'],{cwd:app,stdio:'inherit'});
}
