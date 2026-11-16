/** Offline restore rehearsal only. No fetch, credentials, production writes or Drive changes. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {checksum} from './history-cloud.mjs';
import assert from 'node:assert/strict';

export function verifyLocalBackupRestore(manifests,parts,database){
 assert.equal(existsSync(database),false,'restore destination must be a new local file');
 const db=new DatabaseSync(database),summaries=[],verified=[];
 const md5=bytes=>createHash('md5').update(bytes).digest('hex');
 const exact=(file,expectedBytes,expectedDigest)=>{
  const bytes=readFileSync(file);assert.equal(bytes.length,Number(expectedBytes),'file byte count');
  assert.equal(md5(bytes),expectedDigest,'file content checksum');return JSON.parse(bytes);
 };
 db.exec('CREATE TABLE history(sport TEXT,day TEXT,stream TEXT,checksum TEXT,payload TEXT,PRIMARY KEY(sport,day,stream)); CREATE TABLE pregame(table_name TEXT,sport TEXT,day TEXT,market TEXT,game_id TEXT,player_id TEXT,payload TEXT,PRIMARY KEY(table_name,sport,day,market,game_id,player_id)); BEGIN');
 try{
  for(const f of manifests){
   const digest=f.title.match(/-([a-f0-9]{32})\.json$/)?.[1];assert.ok(digest);
   const m=exact(f.localPath,f.size,digest);assert.equal(m.version,1);assert.equal(m.sport,f.sport);assert.equal(m.day,f.day);
   const recovered=[],seen=new Set(),tables={};let totalBytes=0;
   for(const receipt of m.parts){
    const p=parts.find(p=>p.id===receipt.id);assert.ok(p,'all manifest parts required');assert.equal(receipt.name,p.name);assert.equal(receipt.md5,p.md5);
    const part=exact(p.localPath,receipt.bytes,receipt.md5);assert.equal(part.version,1);assert.equal(part.sport,m.sport);assert.equal(part.day,m.day);totalBytes+=receipt.bytes;
    const rows=f.kind==='history'?part.documents:part.records;assert.ok(Array.isArray(rows));assert.equal(rows.length,receipt[f.kind==='history'?'documents':'records']);
    for(const item of rows){
     if(f.kind==='history'){
      assert.equal(item.game_date,m.day);assert.ok(item.stream);assert.equal(checksum(item.payload),item.checksum);assert.equal(seen.has(item.stream),false);seen.add(item.stream);
      db.prepare('INSERT INTO history VALUES(?,?,?,?,?)').run(m.sport,m.day,item.stream,item.checksum,JSON.stringify(item.payload));
     }else{
      const {table,row}=item;assert.ok(['worker_pregame_originals','worker_pregame_picks','worker_pregame_grades'].includes(table));assert.equal(row.sport,m.sport);assert.equal(row.game_date,m.day);
      assert.match(String(row.game_id),/^\d+$/);assert.match(String(row.player_id),/^\d+$/);assert.match(row.market,/^[a-z0-9_]{1,64}$/);
      if(table!=='worker_pregame_grades'){assert.ok(Date.parse(row.captured_at)<Date.parse(row.game_time));assert.match(row.checksum,/^[a-f0-9]{64}$/);}else assert.ok(['hit','miss','push'].includes(row.result_status));
      const identity=[table,row.market,row.game_id,row.player_id].join('|');assert.equal(seen.has(identity),false);seen.add(identity);tables[table]=(tables[table]||0)+1;
      db.prepare('INSERT INTO pregame VALUES(?,?,?,?,?,?,?)').run(table,m.sport,m.day,row.market,String(row.game_id),String(row.player_id),JSON.stringify(row));
     }recovered.push(item);
    }
    verified.push({id:receipt.id,name:receipt.name,bytes:receipt.bytes,md5:receipt.md5});
   }
   assert.equal(recovered.length,m[f.kind==='history'?'documents':'records']);
   if(f.kind==='pregame')assert.equal(checksum(recovered),m.sourceChecksum,'complete pregame source fingerprint');
   const restored=f.kind==='history'?db.prepare('SELECT stream,day AS game_date,checksum,payload FROM history WHERE sport=? AND day=? ORDER BY rowid').all(m.sport,m.day).map(r=>({...r,payload:JSON.parse(r.payload)})):db.prepare('SELECT table_name AS "table",payload FROM pregame WHERE sport=? AND day=? ORDER BY rowid').all(m.sport,m.day).map(r=>({table:r.table,row:JSON.parse(r.payload)}));
   assert.equal(checksum(restored),checksum(recovered),'SQLite readback must reproduce every restored field');
   summaries.push({kind:f.kind,sport:m.sport,day:m.day,manifestId:f.id,createdAt:f.created_time,manifestMd5:digest,parts:m.parts.length,records:recovered.length,bytes:totalBytes,tables,sourceChecksum:m.sourceChecksum||null,inventoryChecksum:checksum(restored),passed:true});
  }
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.exec('COMMIT');
  return {passed:true,scope:'Exact selected archived sport-days, not an all-current-production disaster recovery snapshot',productionModified:false,remoteWrites:0,manifests:manifests.length,parts:verified.length,bytes:verified.reduce((n,p)=>n+p.bytes,0),historyDocuments:Number(db.prepare('SELECT count(*) AS n FROM history').get().n),pregameRecords:Number(db.prepare('SELECT count(*) AS n FROM pregame').get().n),summaries,verifiedParts:verified};
 }catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(new URL(import.meta.url).pathname)){
 const directory=resolve(process.argv[2]||'');assert.ok(process.argv[2],'local input directory required');
 const result=verifyLocalBackupRestore(JSON.parse(readFileSync(join(directory,'manifests-index.json'))),JSON.parse(readFileSync(join(directory,'parts-index.json'))),join(directory,'isolated-restore.sqlite'));
 writeFileSync(join(directory,'restore-result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
}
