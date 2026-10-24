import {storageInventory} from './storage-inventory.mjs';
import http from 'node:http';import {spawn} from 'node:child_process';import {promises as fs} from 'node:fs';
const root=process.env.RAILWAY_VOLUME_MOUNT_PATH||'/data',port=Number(process.env.PORT||8080);
let status={phase:'storage-recovery',backupComplete:false,deletedFiles:0,freedBytes:0,verifiedDocuments:0,startedAt:new Date().toISOString(),lastEvent:'Starting verified backup and recovery'};
let backupRunning=false;
function scheduleBackups(){setInterval(()=>{if(backupRunning)return;backupRunning=true;const backup=spawn(process.execPath,['scripts/backup-to-drive.mjs'],{stdio:'inherit'});backup.on('exit',()=>{backupRunning=false;});},6*60*60*1000).unref();}
function startApplication(){
 const server=spawn(process.execPath,['server.js'],{stdio:'inherit',env:{...process.env,HOSTNAME:'0.0.0.0'}});
 process.on('SIGTERM',()=>server.kill('SIGTERM'));server.on('exit',code=>process.exit(code||0));scheduleBackups();
}
const initialDisk=await fs.statfs(root),initialFree=initialDisk.bavail*initialDisk.bsize;
const orphanOnly=initialFree>=1024*1024*1024&&process.env.SACH_FORCE_RECOVERY!=='1';
status.scope=orphanOnly?'orphan-temporary-files':'full-volume';
const recovery=http.createServer(async(req,res)=>{
 let storage=null;try{const s=await fs.statfs(root);storage={totalBytes:s.blocks*s.bsize,freeBytes:s.bavail*s.bsize,usedBytes:(s.blocks-s.bfree)*s.bsize};}catch{}
 res.writeHead(req.url==='/api/health'||req.url==='/api/recovery/status'?200:503,{'Content-Type':'application/json','Cache-Control':'no-store'});
 res.end(JSON.stringify({ok:true,service:'sach-sports-dashboard',status:'recovering',...status,storage}));
});
await new Promise(resolve=>recovery.listen(port,'0.0.0.0',resolve));
console.log('RECOVERY_MODE: scheduled captures paused until verified backup frees space');
console.log('STORAGE_INVENTORY',JSON.stringify(await storageInventory(root))); 
const child=spawn(process.execPath,['scripts/backup-to-drive.mjs'],{stdio:['ignore','pipe','pipe'],env:{...process.env,SACH_BACKUP_QUIESCENT:'1',SACH_BACKUP_ORPHANS_ONLY:orphanOnly?'1':'0'}});
let buffer='';child.stdout.on('data',chunk=>{process.stdout.write(chunk);buffer+=chunk;let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);status.lastEvent=line.slice(0,250);if(line.startsWith('RETENTION_DELETE_VERIFIED ')){status.deletedFiles++;status.freedBytes+=Number(line.trim().split(' ').at(-1))||0;}if(line.startsWith('CLOUD_DOCUMENT_VERIFIED '))status.verifiedDocuments++;if(line.includes('"status":"COMPLETE"')&&!orphanOnly)status.backupComplete=true;}});
child.stderr.pipe(process.stderr);
const code=await new Promise(resolve=>child.on('exit',resolve));
const disk=await fs.statfs(root),free=disk.bavail*disk.bsize;
if(free<512*1024*1024){status.phase='recovery-needs-attention';status.lastEvent=`Backup exit ${code}; free bytes ${free}. Capture remains paused.`;console.error('RECOVERY_INCOMPLETE',JSON.stringify(status));}
else{
 console.log('RECOVERY_COMPLETE',JSON.stringify({...status,freeBytes:free}));
 await new Promise(resolve=>recovery.close(resolve));
 startApplication();
 if(orphanOnly)setTimeout(()=>{if(backupRunning)return;backupRunning=true;const backup=spawn(process.execPath,['scripts/backup-to-drive.mjs'],{stdio:'inherit'});backup.on('exit',()=>{backupRunning=false;});},90000).unref();
}
