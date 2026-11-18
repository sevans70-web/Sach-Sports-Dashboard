/** File bridge to the EXISTING authenticated Cloudflare tool. No HTTP client,
 * secrets, deployment or production execution. --next emits ONE request only. */
import {readFile,writeFile,rename,mkdtemp,rm} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {rolldown} from 'rolldown';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
export async function importMechanism(dir){
 const b=await rolldown({input:join(app,'scripts/nba-bootstrap-import.ts'),platform:'node',external:[/^node:/],plugins:[{name:'app-aliases',resolveId(id){if(id.startsWith('@/'))return join(app,id.slice(2)+'.ts');}}]});
 const file=join(dir,'import-functions.mjs');await b.write({file,format:'esm'});await b.close();return import(pathToFileURL(file).href);
}
const json=async p=>JSON.parse(await readFile(p,'utf8'));
const save=async(p,value)=>{const next=p+'.next';await writeFile(next,JSON.stringify(value,null,2)+'\n',{flag:'wx'});await rename(next,p);};
async function main(args){
 const temp=await mkdtemp(join(tmpdir(),'nba-import-bridge-'));
 try{const m=await importMechanism(temp);
 if(args[0]==='--prepare'&&args.length===4){
  const bytes=await readFile(args[1]);if(sha(bytes)!=='c6f828e8463b1bb616e2f88b86f0049cbb67156a1b9404469dd3ef8d74dba6c4')throw Error('bootstrap_unapproved_source_package');
  const plan=JSON.parse(gunzipSync(bytes)),session=m.createImportSession(plan,await json(args[2]),Date.now());
  await writeFile(args[3],gzipSync(JSON.stringify(session)),{flag:'wx'});console.log(JSON.stringify({prepared:true,sessionDigest:session.digest,run:session.run,newPointers:session.manifest.newChecks.length,existingPointers:session.manifest.beforeChecks.length,networkCalls:0}));return;
 }
 if(args[0]==='--ack'&&args.length===3){
  const state=await json(args[1]);if(!state.pending||state.complete)throw Error('bootstrap_no_pending_request');
  const response=await json(args[2]);state.entries.push({requestSha256:sha(state.pending),response});delete state.pending;await save(args[1],state);console.log('Acknowledgement recorded locally; no request sent.');return;
 }
 if(['--next','--resume'].includes(args[0])&&args.length===5){
  const session=JSON.parse(gunzipSync(await readFile(args[1]))),auth=await json(args[2]),proof=await json(args[3]);m.verifyImportSession(session);
  const statePath=args[4];let state;
  try{state=await json(statePath);}catch(e){if(e.code!=='ENOENT')throw e;state={schema:'nba-bootstrap-bridge/v1',sessionDigest:session.digest,operation:auth.operation,attempt:1,entries:[]};await writeFile(statePath,JSON.stringify(state)+'\n',{flag:'wx'});}
  if(state.schema!=='nba-bootstrap-bridge/v1'||state.sessionDigest!==session.digest||state.operation!==auth.operation)throw Error('bootstrap_transcript_mismatch');
  if(args[0]==='--resume'){
   if(state.attempt>=3)throw Error('bootstrap_manual_review_required_after_three_attempts');
   await writeFile(statePath+'.attempt-'+state.attempt+'.json',JSON.stringify(state,null,2)+'\n',{flag:'wx'});
   state={...state,attempt:state.attempt+1,entries:[]};delete state.pending;delete state.complete;delete state.receipt;await save(statePath,state);
  }
  if(state.pending)throw Error('bootstrap_pending_request_ack_or_explicit_resume_required_no_resend');
  if(state.complete){console.log(JSON.stringify({complete:true,receipt:state.receipt,networkCalls:0}));return;}
  let index=0;
  const assertSafety=async()=>{
   const stamp=Date.parse(proof.checkedAt);
   if(!Number.isFinite(stamp)||stamp>Date.now()||Date.now()-stamp>120000||proof.consumerInactiveConfirmed!==true||proof.releaseFreezeConfirmed!==true)throw Error('bootstrap_fresh_readonly_safety_proof_required');
   return proof;
  };
  try{
   const receipt=await m.executePreparedBootstrap(session,{account:proof.accountId,authorization:auth,assertSafety,request:async request=>{
    if(index<state.entries.length){const e=state.entries[index++];if(e.requestSha256!==sha(request))throw Error('bootstrap_transcript_request_mismatch');return e.response;}
    const pending=Error('bootstrap_next_request');pending.request=request;throw pending;
   }});
   if(index!==state.entries.length)throw Error('bootstrap_transcript_extra_responses');
   state.complete=true;state.receipt=receipt;await save(statePath,state);console.log(JSON.stringify({complete:true,receipt,networkCalls:0}));
  }catch(e){if(!e.request)throw e;state.pending=e.request;await save(statePath,state);console.log(JSON.stringify({complete:false,requestSha256:sha(e.request),request:e.request,networkCalls:0}));}
  return;
 }
 throw Error('Offline file bridge only: --prepare PLAN.gz SNAPSHOT.json NEW_SESSION.gz | --next/--resume SESSION.gz AUTH.json SAFETY.json TRANSCRIPT.json | --ack TRANSCRIPT.json RESPONSE.json. No --execute, network, token, deployment or import mode.');
 }finally{await rm(temp,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main(process.argv.slice(2));
