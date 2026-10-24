import {promises as fs} from 'node:fs';import path from 'node:path';
import {SPORTS,expiredHistory,orphanArchiveInfo,retentionCutoff} from './retention-policy.mjs';
export async function storageInventory(root,now=new Date()){
 const groups={},largest=[];let files=0,bytes=0,eligibleBytes=0,temporaryBytes=0;
 async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;const full=path.join(dir,entry.name);if(entry.isDirectory()){await walk(full);continue;}if(!entry.isFile())continue;
  const stat=await fs.stat(full),rel=path.relative(root,full),parts=rel.split(path.sep),sport=parts[0]==='sach-history'&&SPORTS.has(parts[1])?parts[1]:'operational';
  const group=groups[sport]??={files:0,bytes:0,archiveBytes:0,temporaryBytes:0,eligibleBytes:0};files++;bytes+=stat.size;group.files++;group.bytes+=stat.size;
  if(parts.includes('archive'))group.archiveBytes+=stat.size;
  if(orphanArchiveInfo(rel)){temporaryBytes+=stat.size;group.temporaryBytes+=stat.size;}
  if(expiredHistory(rel,now)){eligibleBytes+=stat.size;group.eligibleBytes+=stat.size;}
  if(sport!=='operational'){largest.push({path:rel,bytes:stat.size,modifiedAt:stat.mtime.toISOString()});largest.sort((a,b)=>b.bytes-a.bytes);largest.length=Math.min(20,largest.length);}
 }}
 await walk(root);const stat=await fs.statfs(root);return {capturedAt:now.toISOString(),retentionCutoff:retentionCutoff(now),files,bytes,eligibleBytes,temporaryBytes,groups,largest,totalBytes:stat.blocks*stat.bsize,freeBytes:stat.bavail*stat.bsize};
}
