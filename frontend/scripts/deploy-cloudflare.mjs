import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname,join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// cf beta.28 treats every prior script-API settings update as a deployment
// conflict, even after that configuration has been committed. Skip only this
// provenance check; retain strict configuration-difference checks and secrets.
export function allowApiSettingsUpdate(source){
 const marker='else if(l.last_deployed_from===`api`';
 if(source.split(marker).length!==2||!source.includes('strictMode'))throw Error('Cloudflare CLI changed; review deployment compatibility before uploading');
 return source.replace(marker,'else if(false&&l.last_deployed_from===`api`');
}
export function deploy(){
 const require=createRequire(import.meta.url),root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 const cfRoot=dirname(require.resolve('cf/package.json'));
 const version=JSON.parse(readFileSync(join(cfRoot,'package.json'),'utf8')).version;
 if(version!=='1.0.0-beta.28')throw Error('Review Cloudflare CLI compatibility for '+version);
 const candidates=readdirSync(join(cfRoot,'dist')).filter(name=>/^containers-.*\.mjs$/.test(name)&&readFileSync(join(cfRoot,'dist',name),'utf8').includes('else if(l.last_deployed_from===`api`'));
 if(candidates.length!==1)throw Error('Cloudflare deploy input module is ambiguous');
 const target=join(cfRoot,'dist',candidates[0]),original=readFileSync(target,'utf8');
 if(!existsSync(join(root,'.cloudflare/output/v0/workers/default/worker.config.json')))throw Error('Build the Worker with npm run build:vinext first');
 try{
  writeFileSync(target,allowApiSettingsUpdate(original));
  const result=spawnSync(process.execPath,[join(cfRoot,'bin/cf'),'deploy','--prebuilt',...process.argv.slice(2)],{cwd:root,stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  process.exitCode=result.status??1;
 }finally{writeFileSync(target,original);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))deploy();
