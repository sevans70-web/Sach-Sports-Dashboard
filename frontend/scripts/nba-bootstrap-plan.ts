/** Offline planning/rehearsal only. No network, production bindings or model changes. */
import {createHash} from 'node:crypto';
import {validateNbaHistoryEvidence,checkedNbaHistoryEvidence,nbaEvidenceIdentity,NBA_DISCOVERY_FRESH_MS,type NbaHistoryEvidence} from '@/lib/nba-history-evidence';
import {gunzipSync} from 'node:zlib';
import {basketballModelObservations} from '@/lib/basketball-model-observations';
export const bootstrapSha=(value:unknown)=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export type RetainedSource={archive:string;archiveSha256:string;source:string;payload:any;observedAt:string|null;payloadSha256?:string};
export type BootstrapEntry={evidence:NbaHistoryEvidence;provenance:{archive:string;archiveSha256:string;payloadSha256:string;originalObservedAt:string}};
export type BootstrapPlan={schema:'nba-final-bootstrap/v1';createdAt:string;entries:BootstrapEntry[];digest:string};
export function inspectRetainedNbaSources(records:RetainedSource[],now:number){
 const inventory:any[]=[],selected=new Map<string,BootstrapEntry>();let freshDiscoveries=0;
 for(const r of records){
  const item:any={archive:r.archive,source:r.source,originalObservedAt:r.observedAt,payloadSha256:bootstrapSha(r.payload)};
  try{
   item.kind=nbaEvidenceIdentity(r.source).kind;
   if(r.payloadSha256&&r.payloadSha256!==item.payloadSha256)throw Error('retained_payload_checksum_mismatch');
   if(!r.observedAt)throw Error('original_http_receipt_unknown');
   const e=validateNbaHistoryEvidence(r.source,r.payload,r.observedAt,now);
   item.evidenceSha256=e.sha256;
   if(e.kind==='discovery'){
    item.fresh=now-Date.parse(e.lastVerifiedAt)<NBA_DISCOVERY_FRESH_MS;freshDiscoveries+=Number(item.fresh);
    item.status=item.fresh?'discovery_reference_only':'stale_discovery_reference_only';
   }else{
    item.status='valid_final';const old=selected.get(e.source);
    // Pick a real, dated latest version. No existing durable pointer is
    // overwritten by the insert-only bootstrap rehearsal below.
    if(!old||Date.parse(e.observedAt)>Date.parse(old.evidence.observedAt))selected.set(e.source,{evidence:e,provenance:{archive:r.archive,archiveSha256:r.archiveSha256,payloadSha256:item.payloadSha256,originalObservedAt:r.observedAt}});
   }
  }catch(error){item.status='quarantined';item.reason=(error as Error).message;
   if(item.reason==='nba_evidence_incomplete_census'){
    const c=r.payload?.header?.competitions?.[0];
    item.diagnostic=c?.status?.type?.completed!==true?'not_official_final':
     Number(r.payload?.header?.season?.type)!==2?'not_regular_season':
     Date.parse(c.date)>=Date.parse(r.observedAt||'')-48*3600000?'inside_existing_48h_receipt_rule':'incomplete_or_inconsistent_two_team_census';
   }
  }
  inventory.push(item);
 }
 const entries=[...selected.values()].sort((a,b)=>a.evidence.source.localeCompare(b.evidence.source));
 const body={schema:'nba-final-bootstrap/v1' as const,createdAt:new Date(now).toISOString(),entries};
 const plan:BootstrapPlan={...body,digest:bootstrapSha(body)};
 const observations=entries.flatMap(({evidence:e})=>basketballModelObservations(e.payload,{sport:'nba',season:String(e.payload.header.season.year),gameId:String(e.payload.header.id),source:e.source,retrievedAt:e.observedAt}));
 const counts:Record<string,number>={};for(const r of inventory)counts[r.status==='quarantined'?r.reason:r.status]=(counts[r.status==='quarantined'?r.reason:r.status]||0)+1;
 const dates=entries.map(e=>e.evidence.payload.header.competitions[0].date).sort();
 const pointRows=observations.filter(r=>r.market==='points'),teamCounts=new Map<string,Set<string>>(),playerCounts=new Map<string,Set<string>>();
 for(const r of pointRows){const t=teamCounts.get(r.teamId)||new Set<string>();t.add(r.gameId);teamCounts.set(r.teamId,t);const p=playerCounts.get(r.playerId)||new Set<string>();p.add(r.gameId);playerCounts.set(r.playerId,p);}
 return {plan,inventory,observations,summary:{retainedResponses:records.length,classification:counts,selectedFinalSources:entries.length,observations:observations.length,playerFixtureRecords:pointRows.length,players:new Set(observations.map(r=>r.playerId)).size,teams:new Set(observations.map(r=>r.teamId)).size,teamsWithAtLeast5Fixtures:[...teamCounts.values()].filter(s=>s.size>=5).length,playersWithAtLeast5AppearancesIncludingDnp:[...playerCounts.values()].filter(s=>s.size>=5).length,firstGame:dates[0]||null,lastGame:dates.at(-1)||null,freshDiscoveries,liveForecastCoverageEstablished:false}};
}
export function verifyBootstrapPlan(plan:BootstrapPlan,now:number){
 const {digest,...body}=plan;if(plan.schema!=='nba-final-bootstrap/v1'||bootstrapSha(body)!==digest)throw Error('bootstrap_plan_checksum_mismatch');
 const sources=new Set();
 for(const entry of plan.entries){
  const e=entry.evidence,p=entry.provenance;
  if(e.kind!=='fixture'||sources.has(e.source))throw Error('bootstrap_final_sources_only');sources.add(e.source);
  const checked=validateNbaHistoryEvidence(e.source,e.payload,e.observedAt,now);
  if(e.sha256!==checked.sha256||e.lastVerifiedAt!==e.observedAt||p.originalObservedAt!==e.observedAt||!/^[a-f0-9]{64}$/.test(p.archiveSha256))throw Error('bootstrap_evidence_provenance_invalid');
 }
 return true;
}
/** The exact application store is injected by the isolated SQLite/runtime
 * rehearsal. This function has no production client or remote execution path. */
export function rehearseBootstrap(sql:any,store:any,plan:BootstrapPlan,now:number,transaction:(work:()=>any)=>any){
 verifyBootstrapPlan(plan,now);
 return transaction(()=>{
 const names=[...sql.exec("SELECT name FROM sqlite_master WHERE type='table'")].map((r:any)=>r.name);
 const checks=names.includes('nba_history_checks')?[...sql.exec('SELECT source,sha,verified FROM nba_history_checks')]:[];
 const pending:BootstrapEntry[]=[];let duplicates=0;
 for(const entry of plan.entries){
  const e=entry.evidence,existing=checks.find((r:any)=>r.source===e.source);
  if(existing){const old=store.read(e.source);if(!old||old.sha256!==e.sha256)throw Error('bootstrap_existing_source_conflict');duplicates++;continue;}
  if(names.includes('nba_history_versions'))for(const orphan of sql.exec('SELECT sha,body FROM nba_history_versions WHERE source=?',e.source)){
   // Inspect the existing store's gzip/base64 JSON wire format read-only.
   const old=checkedNbaHistoryEvidence(JSON.parse(gunzipSync(Buffer.from(orphan.body,'base64')).toString('utf8')),e.source,now);
   if(!old||old.sha256!==e.sha256||old.observedAt!==e.observedAt)throw Error('bootstrap_existing_orphan_source_conflict');
  }
  pending.push(entry);
 }
  for(const {evidence} of pending)if(!store.write(evidence))throw Error('bootstrap_insert_not_verified');
  for(const {evidence} of pending){const saved=store.read(evidence.source);if(!saved||saved.sha256!==evidence.sha256||saved.observedAt!==evidence.observedAt||saved.lastVerifiedAt!==evidence.lastVerifiedAt)throw Error('bootstrap_readback_mismatch');}
 const receipt={schema:'nba-bootstrap-rehearsal-receipt/v1',planDigest:plan.digest,duplicates,inserted:pending.map(({evidence:e})=>({source:e.source,sha:e.sha256,verified:e.observedAt})),consumerActivated:false};
 return {...receipt,digest:bootstrapSha(receipt)};
 });
}
/** Deactivate only untouched pointers introduced by this bootstrap. Retain
 * immutable version bodies for audit. Never delete later collection evidence. */
export function rehearseBootstrapRollback(sql:any,receipt:any,transaction:(work:()=>any)=>any){
 if(receipt.consumerActivated)throw Error('bootstrap_after_activation_requires_logical_fallback');
 const {digest,...body}=receipt;if(receipt.schema!=='nba-bootstrap-rehearsal-receipt/v1'||bootstrapSha(body)!==digest)throw Error('bootstrap_rollback_receipt_checksum_mismatch');
 return transaction(()=>{
 for(const r of receipt.inserted){const current=[...sql.exec('SELECT sha,verified FROM nba_history_checks WHERE source=?',r.source)][0];if(!current||current.sha!==r.sha||current.verified!==r.verified)throw Error('bootstrap_rollback_would_touch_later_evidence');}
 for(const r of receipt.inserted)sql.exec('DELETE FROM nba_history_checks WHERE source=? AND sha=? AND verified=?',r.source,r.sha,r.verified);
 return {deactivated:receipt.inserted.length,immutableVersionsRetained:true};
 });
}
