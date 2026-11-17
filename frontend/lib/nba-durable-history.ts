import {env} from 'cloudflare:workers';
import {dashboardJobContext} from '@/lib/dashboard-job-context';
import {assertNbaRankingActive} from '@/lib/nba-ranking-work';
import type {NbaEvidenceAccess,NbaHistoryEvidence} from '@/lib/nba-history-evidence';
type EvidenceNamespace={getByName:(name:string)=>{readNbaHistoryEvidence:(source:string)=>Promise<NbaHistoryEvidence|null>}};
const isEvidenceNamespace=(value:unknown):value is EvidenceNamespace=>Boolean(value&&typeof value==='object'&&'getByName' in value&&typeof value.getByName==='function');
export function configuredNbaEvidence():NbaEvidenceAccess|undefined{
 const job=dashboardJobContext();
 if(job?.readNbaEvidence)return {read:source=>{job.assertActive();return job.readNbaEvidence!(source);},
  ...(job.writeNbaEvidence?{write:(value:NbaHistoryEvidence)=>{job.assertActive();return job.writeNbaEvidence!(value);}}:{})};
 // Foreground requests may read evidence, never persist/modify it. Background
 // jobs use their fenced local SQL hooks, avoiding self-RPC and extra requests.
 const binding=env.DASHBOARD_JOBS;
 if(!isEvidenceNamespace(binding))return;
 return {read:async source=>{
  assertNbaRankingActive();
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{const value=await Promise.race([binding.getByName('capture:nba').readNbaHistoryEvidence(source),new Promise<null>(resolve=>{timer=setTimeout(()=>resolve(null),2000);})]);assertNbaRankingActive();return value;}
  finally{if(timer)clearTimeout(timer);}
 }};
}
