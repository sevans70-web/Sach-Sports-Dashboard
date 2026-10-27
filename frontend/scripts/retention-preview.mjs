import {promises as fs} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {storageInventory} from './storage-inventory.mjs';
import {expiredHistory,retentionCutoff,historyFileInfo} from './retention-policy.mjs';
export async function verifiedFullArchive(root){
 try{
  const status=JSON.parse(await fs.readFile(path.join(root,'sach-history/_system/last-backup.json'),'utf8'));
  const bytes=await fs.readFile(path.join(root,'sach-history/_system/backup-manifest.json'));
  if(status.status!=='COMPLETE'||status.scope!=='full-volume'||status.errors?.length||!status.manifest?.md5||createHash('md5').update(bytes).digest('hex')!==status.manifest.md5)return false;
  const m=JSON.parse(bytes),paths=new Set(m.files.map(f=>f.path));
  return !m.errors.length&&!m.unverifiedSourcePaths.length&&m.sourcePaths.every(p=>paths.has(p))&&m.files.length===status.manifest.files;
 }catch{return false;}
}
export function previewManifest(manifest,now=new Date()){
 const candidates=manifest.files.filter(f=>expiredHistory(f.path,now));
 return {asOf:now.toISOString(),retentionCutoff:retentionCutoff(now),candidates:candidates.length,bytes:candidates.reduce((n,f)=>n+f.bytes,0),bySport:Object.fromEntries(['nba','nfl','cfb','nhl','mlb','wnba','soccer','cbb'].map(sport=>[sport,candidates.filter(f=>historyFileInfo(f.path)?.sport===sport).length])),paths:candidates.map(f=>f.path)};
}
export async function retentionPreview(root,now=new Date()){
 const inventory=await storageInventory(root,now),archiveVerified=await verifiedFullArchive(root);
 let preview=null;try{preview=previewManifest(JSON.parse(await fs.readFile(path.join(root,'sach-history/_system/backup-manifest.json'),'utf8')),now);}catch{}
 return {dryRun:true,deleted:0,asOf:now.toISOString(),retentionCutoff:retentionCutoff(now),liveFiles:inventory.files,liveExpiredBytes:inventory.eligibleBytes,archiveVerified,pruningEnabled:(process.env.SACH_ENABLE_BACKUP_PRUNE??'1')==='1',requiresFreshPerFileVerification:true,preview};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 const root=process.env.RAILWAY_VOLUME_MOUNT_PATH||'/data',report=await retentionPreview(root),file=path.join(root,'sach-history/_system/last-retention-preview.json'),temp=file+'.'+randomUUID()+'.tmp';
 await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(temp,JSON.stringify(report));await fs.rename(temp,file);console.log('RETENTION_PREVIEW',JSON.stringify(report));
}
