/** Explicitly invoked maintenance tooling. Not imported by the dashboard Worker.
 * No credentials, fetch(), deployment or default production transport. */
import {gzipSync,gunzipSync} from 'node:zlib';
import {bootstrapSha,verifyBootstrapPlan,type BootstrapPlan} from './nba-bootstrap-plan';
import {checkedNbaHistoryEvidence} from '@/lib/nba-history-evidence';
export const NBA_BOOTSTRAP_TARGET={namespace:'fc70a55e49c84d28bacc562a8d5cfb62',name:'capture:nba'};
export const NBA_BOOTSTRAP_LIMITS={sources:128,batch:10,payload:128*1024,sql:100*1024,manifest:2*1024*1024,capacity:64*1024*1024,calls:90};
const V='nba_history_versions',C='nba_history_checks',E='nba_bootstrap_events';
const schema=[
 `CREATE TABLE IF NOT EXISTS ${V}(source TEXT,sha TEXT,body TEXT,bytes INTEGER,PRIMARY KEY(source,sha))`,
 `CREATE TABLE IF NOT EXISTS ${C}(source TEXT PRIMARY KEY,sha TEXT,verified TEXT)`,
 `CREATE TABLE IF NOT EXISTS ${E}(event TEXT PRIMARY KEY,run TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('manifest','publish','rollback','consume')),body TEXT NOT NULL CHECK(json_valid(body)))`,
];
const manifest=`(SELECT body FROM ${E} WHERE event='manifest:'||NEW.run AND kind='manifest')`;
const each=(key:string)=>`json_each(json_extract(${manifest},'$.${key}'))`;
const f=(alias:string,key:string)=>`json_extract(${alias}.value,'$.${key}')`;
const checkMatch=(a:string,b:string)=>`${a}.source=${f(b,'source')} AND ${a}.sha=${f(b,'sha')} AND ${a}.verified=${f(b,'verified')}`;
const versionMatch=(a:string,b:string)=>`${a}.source=${f(b,'source')} AND ${a}.sha=${f(b,'sha')} AND ${a}.body=${f(b,'body')} AND ${a}.bytes=${f(b,'bytes')}`;
const badVersions=`EXISTS(SELECT 1 FROM ${each('versions')} j WHERE NOT EXISTS(SELECT 1 FROM ${V} v WHERE ${versionMatch('v','j')})) OR EXISTS(SELECT 1 FROM ${V} v WHERE v.source IN(SELECT value FROM ${each('sources')}) AND NOT EXISTS(SELECT 1 FROM ${each('versions')} j WHERE ${versionMatch('v','j')}))`;
const badBeforeChecks=`EXISTS(SELECT 1 FROM ${each('beforeChecks')} j WHERE NOT EXISTS(SELECT 1 FROM ${C} c WHERE ${checkMatch('c','j')})) OR EXISTS(SELECT 1 FROM ${C} c WHERE c.source IN(SELECT value FROM ${each('sources')}) AND NOT EXISTS(SELECT 1 FROM ${each('beforeChecks')} j WHERE ${checkMatch('c','j')}))`;
const badAfterChecks=`EXISTS(SELECT 1 FROM ${each('newChecks')} j WHERE NOT EXISTS(SELECT 1 FROM ${C} c WHERE ${checkMatch('c','j')})) OR EXISTS(SELECT 1 FROM ${each('beforeChecks')} j WHERE NOT EXISTS(SELECT 1 FROM ${C} c WHERE ${checkMatch('c','j')})) OR EXISTS(SELECT 1 FROM ${C} c WHERE c.source IN(SELECT value FROM ${each('sources')}) AND NOT EXISTS(SELECT 1 FROM ${each('newChecks')} j WHERE ${checkMatch('c','j')}) AND NOT EXISTS(SELECT 1 FROM ${each('beforeChecks')} j WHERE ${checkMatch('c','j')}))`;
schema.push(
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_events_no_replace BEFORE INSERT ON ${E} WHEN EXISTS(SELECT 1 FROM ${E} WHERE event=NEW.event) BEGIN SELECT RAISE(ABORT,'bootstrap_journal_immutable'); END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_events_no_update BEFORE UPDATE ON ${E} BEGIN SELECT RAISE(ABORT,'bootstrap_journal_immutable'); END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_events_no_delete BEFORE DELETE ON ${E} BEGIN SELECT RAISE(ABORT,'bootstrap_journal_immutable'); END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_manifest_guard BEFORE INSERT ON ${E} WHEN NEW.kind='manifest' BEGIN SELECT CASE WHEN NEW.event!='manifest:'||NEW.run OR json_extract(NEW.body,'$.run')!=NEW.run OR json_extract(NEW.body,'$.consumerInactive')!=1 THEN RAISE(ABORT,'bootstrap_manifest_invalid') END; END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_publish_guard BEFORE INSERT ON ${E} WHEN NEW.kind='publish' BEGIN
 SELECT CASE WHEN NEW.event!='publish:'||NEW.run OR NEW.body!='{}' OR ${manifest} IS NULL OR EXISTS(SELECT 1 FROM ${E} WHERE run=NEW.run AND kind IN ('rollback','consume')) THEN RAISE(ABORT,'bootstrap_publish_invalid') END;
 SELECT CASE WHEN ${badVersions} OR ${badBeforeChecks} THEN RAISE(ABORT,'bootstrap_atomic_publish_conflict') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_publish_apply AFTER INSERT ON ${E} WHEN NEW.kind='publish' BEGIN
 INSERT INTO ${C}(source,sha,verified) SELECT ${f('j','source')},${f('j','sha')},${f('j','verified')} FROM ${each('newChecks')} j;
 END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_rollback_guard BEFORE INSERT ON ${E} WHEN NEW.kind='rollback' BEGIN
 SELECT CASE WHEN NEW.event!='rollback:'||NEW.run OR NEW.body!='{}' OR ${manifest} IS NULL OR NOT EXISTS(SELECT 1 FROM ${E} WHERE event='publish:'||NEW.run AND kind='publish') OR EXISTS(SELECT 1 FROM ${E} WHERE run=NEW.run AND kind='consume') THEN RAISE(ABORT,'bootstrap_rollback_invalid_or_consumed') END;
 SELECT CASE WHEN ${badVersions} OR ${badAfterChecks} THEN RAISE(ABORT,'bootstrap_rollback_later_evidence') END;
 END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_rollback_apply AFTER INSERT ON ${E} WHEN NEW.kind='rollback' BEGIN
 DELETE FROM ${C} WHERE EXISTS(SELECT 1 FROM ${each('newChecks')} j WHERE ${checkMatch(C,'j')});
 END`,
 `CREATE TRIGGER IF NOT EXISTS nba_bootstrap_consume_guard BEFORE INSERT ON ${E} WHEN NEW.kind='consume' BEGIN SELECT CASE WHEN NEW.event!='consume:'||NEW.run OR NEW.body!='{}' OR NOT EXISTS(SELECT 1 FROM ${E} WHERE event='publish:'||NEW.run) OR EXISTS(SELECT 1 FROM ${E} WHERE event='rollback:'||NEW.run) THEN RAISE(ABORT,'bootstrap_consume_invalid') END; END`,
);
export const bootstrapSchema=()=>schema.map(sql=>({sql,params:[]}));
const normalized=(s:string)=>s.replace(/IF NOT EXISTS\s+/gi,'').replace(/\s+/g,'').replace(/;$/,'').toLowerCase();
const nameOf=(s:string)=>s.match(/^CREATE (?:TABLE|TRIGGER) IF NOT EXISTS (\w+)/)![1];
export const schemaQuery={sql:`SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND (name IN ('${V}','${C}','${E}') OR tbl_name IN ('${V}','${C}','${E}')) ORDER BY name`,params:[]};
export function verifyBootstrapSchema(rows:any[],complete=false){
 const expected=new Map(schema.map(sql=>[nameOf(sql),normalized(sql)]));
 for(const row of rows)if(!expected.has(row.name)||expected.get(row.name)!==normalized(row.sql))throw Error('bootstrap_unrecognized_schema');
 if(complete&&rows.length!==expected.size)throw Error('bootstrap_schema_incomplete');
}
export type Query={sql:string;params:any[]};
export type Snapshot={schema:any[];versions:any[];checks:any[];totalBytes:number};
export type ImportSession={schema:'nba-bootstrap-import/v1';run:string;manifest:any;digest:string};
export function createImportSession(plan:BootstrapPlan,snapshot:Snapshot,now:number):ImportSession{
 verifyBootstrapPlan(plan,now);verifyBootstrapSchema(snapshot.schema);
 if(plan.entries.length<1||plan.entries.length>NBA_BOOTSTRAP_LIMITS.sources)throw Error('bootstrap_source_limit');
 if(!Number.isSafeInteger(snapshot.totalBytes)||snapshot.totalBytes<0)throw Error('bootstrap_capacity_invalid');
 const sources=plan.entries.map(x=>x.evidence.source),versions:any[]=[],beforeChecks:any[]=[],newChecks:any[]=[];
 for(const {evidence:e} of plan.entries){
  if(!checkedNbaHistoryEvidence(e,e.source,now))throw Error('bootstrap_plan_envelope_invalid');
  const vs=snapshot.versions.filter(v=>v.source===e.source),cs=snapshot.checks.filter(c=>c.source===e.source);
  if(vs.length>1||cs.length>1)throw Error('bootstrap_existing_source_conflict');
  if(cs.length&&!vs.length)throw Error('bootstrap_dangling_pointer');
  let version=vs[0];
  if(version){
   let old;try{old=checkedNbaHistoryEvidence(JSON.parse(gunzipSync(Buffer.from(version.body,'base64')).toString('utf8')),e.source,now);}catch{}
   if(!old||old.sha256!==e.sha256||version.sha!==e.sha256||version.bytes!==Buffer.byteLength(version.body)||(!cs.length&&(old.observedAt!==e.observedAt||old.lastVerifiedAt!==e.lastVerifiedAt)))throw Error('bootstrap_existing_source_conflict');
   if(cs.length&&!checkedNbaHistoryEvidence({...old,lastVerifiedAt:cs[0].verified},e.source,now))throw Error('bootstrap_existing_pointer_invalid');
   if(cs.length&&cs[0].sha!==version.sha)throw Error('bootstrap_existing_pointer_invalid');
  }else{const body=gzipSync(JSON.stringify(e)).toString('base64');version={source:e.source,sha:e.sha256,body,bytes:Buffer.byteLength(body)};}
  versions.push(version);
  if(cs.length)beforeChecks.push(cs[0]);else newChecks.push({source:e.source,sha:e.sha256,verified:e.observedAt});
 }
 const additional=versions.filter(v=>!snapshot.versions.some(p=>p.source===v.source&&p.sha===v.sha)).reduce((n,v)=>n+v.bytes,0);
 if(snapshot.totalBytes+additional>NBA_BOOTSTRAP_LIMITS.capacity)throw Error('bootstrap_evidence_capacity');
 const data={planDigest:plan.digest,preparedAt:new Date(now).toISOString(),target:NBA_BOOTSTRAP_TARGET,consumerInactive:true,sources,versions,beforeChecks,newChecks,beforeSnapshotSha256:bootstrapSha(snapshot),provenance:plan.entries.map(e=>({source:e.evidence.source,semanticSha256:e.evidence.sha256,...e.provenance}))};
 const run=bootstrapSha(data),manifest={...data,run};
 if(Buffer.byteLength(JSON.stringify(manifest))>NBA_BOOTSTRAP_LIMITS.manifest)throw Error('bootstrap_manifest_limit');
 const result={schema:'nba-bootstrap-import/v1' as const,run,manifest};return {...result,digest:bootstrapSha(result)};
}
export function verifyImportSession(s:ImportSession){
 const {digest,...rest}=s;const {run,...data}=s.manifest;
 if(s.schema!=='nba-bootstrap-import/v1'||bootstrapSha(rest)!==digest||s.run!==run||bootstrapSha(data)!==run||JSON.stringify(s.manifest.target)!==JSON.stringify(NBA_BOOTSTRAP_TARGET))throw Error('bootstrap_session_checksum');
 return true;
}
export function bootstrapRequest(account:string,query:Query){
 if(!/^[a-f0-9]{32}$/.test(account))throw Error('bootstrap_account_invalid');
 if(Buffer.byteLength(query.sql)>NBA_BOOTSTRAP_LIMITS.sql||query.params.length>100)throw Error('bootstrap_query_limit');
 return {method:'POST' as const,path:`/accounts/${account}/workers/durable_objects/namespaces/${NBA_BOOTSTRAP_TARGET.namespace}/query/v2`,body:{durable_object_name:NBA_BOOTSTRAP_TARGET.name,jurisdiction:'none',queries:[query]}};
}
export function decodeQueryResponse(response:any){
 if(response?.success!==true||response.errors?.length||response.result?.error||response.result?.results?.length!==1)throw Error('bootstrap_query_response_invalid');
 const q=response.result.results[0];if(!Array.isArray(q.columns)||new Set(q.columns).size!==q.columns.length||!Array.isArray(q.rows)||![q.meta?.rows_read,q.meta?.rows_written].every(n=>Number.isSafeInteger(n)&&n>=0)||q.rows.some((r:any)=>!Array.isArray(r)||r.length!==q.columns.length))throw Error('bootstrap_query_shape_invalid');
 return q.rows.map((r:any)=>Object.fromEntries(q.columns.map((c:string,i:number)=>[c,r[i]])));
}
const pack=(sql:string,params:any[]=[]):Query=>({sql,params});
export const journalQuery=(run:string)=>pack(`SELECT event,run,kind,body FROM ${E} WHERE run=? ORDER BY event`,[run]);
export function stageQueries(s:ImportSession){
 verifyImportSession(s);const out:Query[]=[];
 for(let i=0;i<s.manifest.versions.length;i+=NBA_BOOTSTRAP_LIMITS.batch){const rows=s.manifest.versions.slice(i,i+NBA_BOOTSTRAP_LIMITS.batch),json=JSON.stringify(rows);
  if(Buffer.byteLength(json)>NBA_BOOTSTRAP_LIMITS.payload)throw Error('bootstrap_batch_limit');
  const items=`items AS (SELECT json_extract(value,'$.source') source,json_extract(value,'$.sha') sha,json_extract(value,'$.body') body,json_extract(value,'$.bytes') bytes FROM json_each(?))`;
  out.push(pack(`WITH ${items} INSERT INTO ${V}(source,sha,body,bytes) SELECT i.source,i.sha,i.body,i.bytes FROM items i
 WHERE NOT EXISTS(SELECT 1 FROM ${V} v WHERE v.source=i.source AND v.sha=i.sha)
 AND NOT EXISTS(SELECT 1 FROM ${V} v JOIN items x ON x.source=v.source WHERE v.sha IS NOT x.sha OR v.body IS NOT x.body OR v.bytes IS NOT x.bytes)
 AND (SELECT COALESCE(SUM(LENGTH(body)),0) FROM ${V})+(SELECT COALESCE(SUM(x.bytes),0) FROM items x WHERE NOT EXISTS(SELECT 1 FROM ${V} v WHERE v.source=x.source AND v.sha=x.sha))<=${NBA_BOOTSTRAP_LIMITS.capacity}
 RETURNING source,sha`,[json]));
 }
 return out;
}
export function eventQuery(s:ImportSession,kind:'manifest'|'publish'|'rollback'|'consume'){
 verifyImportSession(s);const body=kind==='manifest'?JSON.stringify(s.manifest):'{}';
 return pack(`INSERT INTO ${E}(event,run,kind,body) VALUES(?,?,?,?)`,[kind+':'+s.run,s.run,kind,body]);
}
export async function readImportSnapshot(sources:string[],query:(q:Query)=>Promise<any[]>):Promise<Snapshot>{
 const rows=await query(schemaQuery);verifyBootstrapSchema(rows);
 const has=(name:string)=>rows.some(r=>r.type==='table'&&r.name===name),versions:any[]=[],checks:any[]=[];
 for(let i=0;i<sources.length;i+=10){const names=JSON.stringify(sources.slice(i,i+10));
  if(has(V))versions.push(...await query(pack(`SELECT source,sha,body,bytes FROM ${V} WHERE source IN(SELECT value FROM json_each(?)) ORDER BY source,sha`,[names])));
  if(has(C))checks.push(...await query(pack(`SELECT source,sha,verified FROM ${C} WHERE source IN(SELECT value FROM json_each(?)) ORDER BY source`,[names])));
 }
 const totalBytes=has(V)?(await query(pack(`SELECT COALESCE(SUM(LENGTH(body)),0) totalBytes FROM ${V}`)))[0].totalBytes:0;
 return {schema:rows,versions,checks,totalBytes};
}
export function verifyImportReadback(s:ImportSession,snapshot:Snapshot,published:boolean){
 verifyImportSession(s);verifyBootstrapSchema(snapshot.schema,true);
 const sort=(a:any[])=>[...a].sort((x,y)=>x.source.localeCompare(y.source));
 if(bootstrapSha(sort(snapshot.versions))!==bootstrapSha(sort(s.manifest.versions)))throw Error('bootstrap_version_readback_mismatch');
 const checks=published?[...s.manifest.beforeChecks,...s.manifest.newChecks]:s.manifest.beforeChecks;
 if(bootstrapSha(sort(snapshot.checks))!==bootstrapSha(sort(checks)))throw Error('bootstrap_pointer_readback_mismatch');
}
function withDeadline<T>(pending:Promise<T>):Promise<T>{
 let timer:ReturnType<typeof setTimeout>;return Promise.race([pending,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(Error('bootstrap_ambiguous_timeout_stop_and_resume_same_run')),15000);})]).finally(()=>clearTimeout(timer));
}
export type ImportAuthorization={operation:'import'|'rollback';sessionDigest:string;planDigest:string;approvalReference:string;expiresAt:string;consumerInactive:true;fallbackVersion:string;protectedRecordBaselineSha256:string};
export const BOOTSTRAP_FALLBACK='a48c431a-5c3e-4491-8529-38cb20dfa898';
export const BOOTSTRAP_RESEARCH='39ea465b-ca3f-47f8-9bd2-50eb2f1ad174';
/** Explicit callback transport: a future approved operator can pass the existing
 * authenticated cloudflare.request; no token export or alternate client. */
export async function executePreparedBootstrap(s:ImportSession,options:{account:string;authorization:ImportAuthorization;request:(q:ReturnType<typeof bootstrapRequest>)=>Promise<any>;assertSafety:()=>Promise<{fallbackVersion:string;buildsPaused:boolean;researchDeployment:string;protectedRecordSha256:string}>;now?:()=>number;onCheckpoint?:(event:any)=>Promise<void>}){
 verifyImportSession(s);const a=options.authorization,now=options.now||Date.now;
 const safety=async()=>{
  if(!a||!['import','rollback'].includes(a.operation)||a.sessionDigest!==s.digest||a.planDigest!==s.manifest.planDigest||!a.approvalReference?.trim()||!Number.isFinite(Date.parse(a.expiresAt))||Date.parse(a.expiresAt)<=now()||Date.parse(a.expiresAt)>now()+30*60000||a.consumerInactive!==true||a.fallbackVersion!==BOOTSTRAP_FALLBACK||!/^[a-f0-9]{64}$/.test(a.protectedRecordBaselineSha256))throw Error('bootstrap_separate_authorization_required');
  const v=await withDeadline(options.assertSafety());if(v.fallbackVersion!==BOOTSTRAP_FALLBACK||v.researchDeployment!==BOOTSTRAP_RESEARCH||v.buildsPaused!==true||v.protectedRecordSha256!==a.protectedRecordBaselineSha256)throw Error('bootstrap_safety_gate_failed');
 };
 await safety();let calls=0;
 const query=async(q:Query)=>{if(++calls>NBA_BOOTSTRAP_LIMITS.calls)throw Error('bootstrap_request_limit');if(Date.parse(a.expiresAt)<=now())throw Error('bootstrap_authorization_expired');return decodeQueryResponse(await withDeadline(options.request(bootstrapRequest(options.account,q))));};
 // Refuse unrecognized tables/triggers before any DDL or evidence mutation.
 verifyBootstrapSchema(await query(schemaQuery));
 if(a.operation==='import')for(const q of bootstrapSchema())await query(q);
 else verifyBootstrapSchema(await query(schemaQuery),true);
 const events=await query(journalQuery(s.run)),find=(kind:string)=>events.find((r:any)=>r.kind===kind);
 if(find('manifest')&&find('manifest').body!==JSON.stringify(s.manifest))throw Error('bootstrap_manifest_readback_mismatch');
 if(a.operation==='import'){
  if(find('rollback')||find('consume'))throw Error('bootstrap_run_closed');
  if(!find('manifest'))await query(eventQuery(s,'manifest'));
  if(!find('publish')){
   for(const q of stageQueries(s)){
    await query(q);
    const expected=JSON.parse(q.params[0]),sources=JSON.stringify(expected.map((v:any)=>v.source));
    const actual=await query(pack(`SELECT source,sha,body,bytes FROM ${V} WHERE source IN(SELECT value FROM json_each(?)) ORDER BY source,sha`,[sources]));
    if(bootstrapSha(actual)!==bootstrapSha([...expected].sort((x,y)=>x.source.localeCompare(y.source))))throw Error('bootstrap_stage_readback_mismatch');
    await options.onCheckpoint?.({phase:'stage',verified:expected.map((v:any)=>v.source),run:s.run});
   }
   await safety();await query(eventQuery(s,'publish'));
  }
  verifyImportReadback(s,await readImportSnapshot(s.manifest.sources,query),true);
 }else{
  if(!find('manifest')||!find('publish')||find('consume'))throw Error('bootstrap_rollback_invalid_or_consumed');
  if(!find('rollback')){await safety();await query(eventQuery(s,'rollback'));}
  verifyImportReadback(s,await readImportSnapshot(s.manifest.sources,query),false);
 }
 await safety();const receipt={schema:'nba-bootstrap-execution-receipt/v1',operation:a.operation,sessionDigest:s.digest,run:s.run,planDigest:s.manifest.planDigest,ownedPointers:s.manifest.newChecks,existingPointersPreserved:s.manifest.beforeChecks.length,readbackVerified:true,consumerInactive:true,calls};
 await options.onCheckpoint?.(receipt);return {...receipt,sha256:bootstrapSha(receipt)};
}
