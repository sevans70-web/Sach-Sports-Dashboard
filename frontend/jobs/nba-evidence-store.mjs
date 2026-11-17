import {checkedNbaHistoryEvidence,validateNbaHistoryEvidence,completedNbaDiscoveryEvents} from '../lib/nba-history-evidence';
import {encode,decode} from './budget.mjs';

// Dedicated operational evidence tables inside the existing capture:nba DO.
// Immutable bodies and a monotonic successful-check pointer; no ledger access.
export function nbaEvidenceStore(sql,now=()=>Date.now()){
 const rows=(query,...args)=>[...sql.exec(query,...args)];
 const exists=()=>rows("SELECT name FROM sqlite_master WHERE type='table' AND name='nba_history_checks'").length>0;
 return {
  read(source){
   if(!exists())return null;
   const r=rows('SELECT v.body,c.verified FROM nba_history_checks c JOIN nba_history_versions v ON v.source=c.source AND v.sha=c.sha WHERE c.source=?',source)[0];
   if(!r)return null;
   return checkedNbaHistoryEvidence({...decode(r.body),lastVerifiedAt:r.verified},source,now());
  },
  write(value){
   const validated=validateNbaHistoryEvidence(value.source,value.payload,value.observedAt,now());
   if(value.sha256!==validated.sha256||value.kind!==validated.kind)throw Error('nba_evidence_checksum_invalid');
   const body=encode(validated);
   sql.exec('CREATE TABLE IF NOT EXISTS nba_history_versions(source TEXT,sha TEXT,body TEXT,bytes INTEGER,PRIMARY KEY(source,sha))');
   sql.exec('CREATE TABLE IF NOT EXISTS nba_history_checks(source TEXT PRIMARY KEY,sha TEXT,verified TEXT)');
   const prior=rows('SELECT c.verified,v.body FROM nba_history_checks c JOIN nba_history_versions v ON v.source=c.source AND v.sha=c.sha WHERE c.source=?',value.source)[0];
   if(prior&&Date.parse(prior.verified)>=Date.parse(value.observedAt))return false;
   if(prior&&validated.kind==='discovery'){
    const previous=completedNbaDiscoveryEvents(decode(prior.body).payload),next=completedNbaDiscoveryEvents(validated.payload);
    if([...previous].some(id=>!next.has(id)))throw Error('nba_evidence_discovery_regression');
   }
   const existing=rows('SELECT sha FROM nba_history_versions WHERE source=? AND sha=?',value.source,validated.sha256).length;
   if(!existing&&rows('SELECT COALESCE(SUM(bytes),0) AS bytes FROM nba_history_versions')[0].bytes+body.length>64*1024*1024)throw Error('nba_evidence_capacity');
   sql.exec('INSERT OR IGNORE INTO nba_history_versions VALUES(?,?,?,?)',value.source,validated.sha256,body,body.length);
   sql.exec('INSERT INTO nba_history_checks VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET sha=excluded.sha,verified=excluded.verified',value.source,validated.sha256,value.observedAt);
   return true;
  },
 };
}
