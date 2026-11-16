/** Offline, lossless packaging/restoration of an explicitly authorized read-only database export.
 * No network, credentials, remote writes, application imports or production database handles.
 */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync,gunzipSync} from 'node:zlib';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';

export const RECOVERY_TABLES=Object.freeze({history_documents:['sport','game_date','stream'],worker_pregame_originals:['sport','market','game_id','player_id'],worker_pregame_picks:['sport','market','game_id','player_id'],worker_pregame_grades:['sport','market','game_id','player_id']});
const hash=(algorithm,bytes)=>createHash(algorithm).update(bytes).digest('hex');
const identity=(table,row)=>JSON.stringify(RECOVERY_TABLES[table].map(k=>{assert.ok(row[k]!==undefined&&row[k]!==null,'missing source primary key');return String(row[k]);}));
const compare=(a,b)=>{for(let i=0;i<a.length;i++){const c=Buffer.compare(Buffer.from(a[i]),Buffer.from(b[i]));if(c)return c;}return 0;};
function decodeRows(table,rows){
 assert.ok(Object.hasOwn(RECOVERY_TABLES,table));assert.ok(Array.isArray(rows));
 return rows.map(record=>{assert.equal(typeof record.row_json,'string');assert.equal(hash('md5',record.row_json),record.row_md5,'source row byte hash');const row=JSON.parse(record.row_json);return {...record,identity:identity(table,row)};});
}
export function packageRecoveryPart(directory,table,ordinal,records){
 mkdirSync(directory,{recursive:true});decodeRows(table,records);assert.ok(Number.isInteger(ordinal)&&ordinal>=0);
 const raw=JSON.stringify({schema:'sach-dashboard-recovery-part/v1',table,ordinal,records});const bytes=gzipSync(raw,{level:9}),sha256=hash('sha256',bytes),name=`${table}-part-${String(ordinal).padStart(4,'0')}-${sha256}.json.gz`,path=join(directory,name);
 if(existsSync(path))assert.deepEqual(readFileSync(path),bytes,'existing content-addressed file cannot be replaced');else writeFileSync(path,bytes,{flag:'wx'});
 return {table,ordinal,name,path,records:records.length,bytes:bytes.length,sha256,rawSha256:hash('sha256',raw)};
}
export function inspectRecoveryParts(parts){
 const tables={},records=[];
 for(const p of parts){
  const bytes=readFileSync(p.path);assert.equal(bytes.length,p.bytes);assert.equal(hash('sha256',bytes),p.sha256,'backup part SHA256');const raw=gunzipSync(bytes);assert.equal(hash('sha256',raw),p.rawSha256);
  const body=JSON.parse(raw);assert.equal(body.schema,'sach-dashboard-recovery-part/v1');assert.equal(body.table,p.table);assert.equal(body.ordinal,p.ordinal);assert.equal(body.records.length,p.records);
  for(const record of decodeRows(p.table,body.records))records.push({table:p.table,...record});
 }
 for(const table of Object.keys(RECOVERY_TABLES)){
  const selected=records.filter(r=>r.table===table).sort((a,b)=>compare(JSON.parse(a.identity),JSON.parse(b.identity))),seen=new Set();
  for(const r of selected){assert.equal(seen.has(r.identity),false,'duplicate source identity');seen.add(r.identity);}
  tables[table]={records:selected.length,inventory:hash('md5',selected.map(r=>r.row_md5).join(''))};
 }
 return {tables,records};
}
export function verifyRecoverySource(parts,before,after){
 assert.deepEqual(after.tables,before.tables,'production inventories changed during export');
 const restored=inspectRecoveryParts(parts);
 for(const source of before.tables){assert.deepEqual(restored.tables[source.source],{records:Number(source.records),inventory:source.inventory},'backup must cover every source row: '+source.source);}
 return restored.tables;
}
export function restoreCurrentRecovery(parts,baseline,destination){
 assert.equal(existsSync(destination),false,'refusing to overwrite a restore destination');
 const validated=inspectRecoveryParts(parts);for(const source of baseline.tables)assert.deepEqual(validated.tables[source.source],{records:Number(source.records),inventory:source.inventory});
 const db=new DatabaseSync(destination);db.exec('CREATE TABLE records(table_name TEXT,identity TEXT,row_md5 TEXT,row_json TEXT,PRIMARY KEY(table_name,identity)); BEGIN');
 try{
  const insert=db.prepare('INSERT INTO records VALUES(?,?,?,?)');for(const r of validated.records)insert.run(r.table,r.identity,r.row_md5,r.row_json);
  const results={};for(const table of Object.keys(RECOVERY_TABLES)){
   const rows=db.prepare('SELECT identity,row_md5,row_json FROM records WHERE table_name=?').all(table).sort((a,b)=>compare(JSON.parse(a.identity),JSON.parse(b.identity)));
   for(const r of rows){assert.equal(hash('md5',r.row_json),r.row_md5);assert.equal(identity(table,JSON.parse(r.row_json)),r.identity);}
   results[table]={records:rows.length,inventory:hash('md5',rows.map(r=>r.row_md5).join(''))};assert.deepEqual(results[table],validated.tables[table]);
  }
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');
  if(validated.records.length){const r=validated.records[0];assert.throws(()=>insert.run(r.table,r.identity,r.row_md5,r.row_json),/UNIQUE/,'restore prevents duplicate writes');}
  db.exec('COMMIT');return {schema:'sach-dashboard-recovery-restore/v1',passed:true,productionModified:false,duplicatesPrevented:true,sourceRecoveryPoint:baseline.captured_at,tables:results,totalRecords:validated.records.length};
 }catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
}
