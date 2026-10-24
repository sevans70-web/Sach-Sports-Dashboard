import {promises as fs,createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {expiredHistory,historyFileInfo,retentionCutoff,orphanArchiveInfo} from './retention-policy.mjs';
export async function md5File(file){const hash=createHash('md5');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function pruneVerifiedFile({full,rel,size,remoteFile,verifyRemote,migrateDocument,recordArchive,now=new Date(),quiescent=false}){
 const orphan=quiescent?orphanArchiveInfo(rel):null;
 if((!expiredHistory(rel,now)&&!orphan)||!remoteFile?.md5Checksum||!remoteFile.id)return false;
 const current=await fs.stat(full);if(current.size!==size||+now-current.mtimeMs<3600000)return false;
 const verified=await verifyRemote(remoteFile.id);
 if(verified.trashed||Number(verified.size)!==size||verified.md5Checksum!==remoteFile.md5Checksum)return false;
 const localMd5=await md5File(full);if(localMd5.toLowerCase()!==verified.md5Checksum.toLowerCase())return false;
 const payload=await migrateDocument(full,rel,size);
 // A file captured earlier can still contain this week's or future fixtures.
 const rows=Array.isArray(payload)?payload:[];
 if(rows.some(r=>r.gameTime&&Number.isFinite(Date.parse(r.gameTime))&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(r.gameTime))>=retentionCutoff(now)))return false;
 const info=orphan||historyFileInfo(rel);
 await recordArchive({relative_path:rel,md5:localMd5,drive_file_id:verified.id,source_bytes:size,game_date:info.day,sport:info.sport,verified_at:now.toISOString()});
 const after=await fs.stat(full);if(after.size!==current.size||after.mtimeMs!==current.mtimeMs||after.ino!==current.ino||after.ctimeMs!==current.ctimeMs)return false;
 await fs.unlink(full);return true;
}
