import {gzipSync,gunzipSync} from 'node:zlib';
import {DurableObject} from 'cloudflare:workers';
import {evidence,seed,policy,study,targetKey,capture,verifyForecast,scoreRecords} from './domain.mjs';
import * as sources from './sources.mjs';
const SLOT=15*60000,LEASE=120000;
const seedTargets=new Map(seed.targets.map(r=>[r.key,r.receiptSha256]));
const safeError=e=>/^([a-z][a-z0-9_]*|source_http_\d+)$/.test(e?.message||'')?e.message:'workflow_step_failed';

/** One coordination atom for this one frozen study. No production bindings. */
export class NhlShadowCoordinator extends DurableObject {
 constructor(ctx,env){super(ctx,env);ctx.blockConcurrencyWhile(async()=>{
  for(const sql of [
   'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY,value TEXT NOT NULL)',
   'CREATE TABLE IF NOT EXISTS objects (key TEXT PRIMARY KEY,hash TEXT NOT NULL,body TEXT,state TEXT NOT NULL,kind TEXT NOT NULL,created_at INTEGER NOT NULL,anchor_before INTEGER,uploaded_at INTEGER,anchor_status TEXT)',
   'CREATE TABLE IF NOT EXISTS receipts (target TEXT PRIMARY KEY,sha TEXT UNIQUE NOT NULL,object_key TEXT NOT NULL,game_id TEXT NOT NULL,game_time INTEGER NOT NULL,market TEXT NOT NULL,player_id TEXT NOT NULL,cycle TEXT NOT NULL,grade_sha TEXT,grade_key TEXT,next_grade_at INTEGER NOT NULL,pending_reason TEXT,score_body TEXT NOT NULL,score_grade TEXT)',
   'CREATE TABLE IF NOT EXISTS histories (player_id TEXT NOT NULL,day TEXT NOT NULL,object_key TEXT NOT NULL,PRIMARY KEY(player_id,day))',
   'CREATE TABLE IF NOT EXISTS cycles (id TEXT PRIMARY KEY,state TEXT NOT NULL,data TEXT NOT NULL)',
   'CREATE INDEX IF NOT EXISTS receipt_cycles ON receipts(cycle)',
   'CREATE INDEX IF NOT EXISTS pending_grades ON receipts(next_grade_at,game_id)',
  ])this.sql(sql);
  const fingerprint=evidence.digest({study,models:seed.modelFrozenCommit,protocol:policy,targets:seed.targets});
  const prior=this.meta('fingerprint');if(prior&&prior!==fingerprint)throw Error('study_fingerprint_changed');if(!prior)this.setMeta('fingerprint',fingerprint);
 });}
 now(){return Date.now();}
 sql(q,...args){return this.ctx.storage.sql.exec(q,...args);}
 rows(q,...args){return this.sql(q,...args).toArray();}
 meta(key){const row=this.rows('SELECT value FROM meta WHERE key=?',key)[0];return row?JSON.parse(row.value):null;}
 setMeta(key,value){this.sql('INSERT OR REPLACE INTO meta(key,value) VALUES(?,?)',key,JSON.stringify(value));}
 ready(){return this.meta('seedReady')===true;}
 assertLease(token){const lease=this.meta('lease');if(lease?.token!==token||lease.until<=this.now())throw Error('lease_lost');}
 claim(){return this.ctx.storage.transactionSync(()=>{const lease=this.meta('lease');if(lease&&lease.until>this.now())return null;const token=crypto.randomUUID();this.setMeta('lease',{token,until:this.now()+LEASE});return token;});}
 reserveObject(kind,value,before=null){const body=evidence.canonical(value);if(body.length>1500000)throw Error('evidence_object_too_large');const hash=evidence.digest(body),key=kind+'/'+hash+'.json';
  this.sql("INSERT OR IGNORE INTO objects(key,hash,body,state,kind,created_at,anchor_before) VALUES(?,?,?,'pending',?,?,?)",key,hash,gzipSync(body).toString('base64'),kind,this.now(),before);return {key,hash};
 }
 decodeBody(row){const text=gunzipSync(Buffer.from(row.body,'base64')).toString('utf8');if(evidence.digest(text)!==row.hash)throw Error('evidence_checksum_failed');return text;}
 async putObject(row){
  if(!/^(receipts|grades|sources|histories|runs)\/[a-f0-9]{64}\.json$/.test(row.key))throw Error('invalid_object_reference');this.decodeBody(row);
  // SQLite is authoritative. Every retry writes the exact compressed bytes
  // reserved there; KV visibility and last-writer behavior never elect a pick.
  const value=JSON.stringify({format:'cw08-gzip-json-v1',sha256:row.hash,gzipBase64:row.body});
  const existing=await this.env.EVIDENCE.get(row.key);
  if(existing!==null&&existing!==value)throw Error('immutable_object_conflict');
  if(existing===null)await this.env.EVIDENCE.put(row.key,value,{metadata:{study,sha256:row.hash,reservedAt:row.created_at}});
  return {uploaded:new Date(this.now())};
 }
 async upload(row,token){
  const object=await this.putObject(row);if(token)this.assertLease(token);
  const uploaded=object.uploaded.getTime(),status=row.kind==='receipts'&&row.anchor_before!=null&&uploaded>=row.anchor_before?'late':'on_time';
  this.sql("UPDATE objects SET state='stored',uploaded_at=?,anchor_status=? WHERE key=? AND hash=?",uploaded,status,row.key,row.hash);
  return status;
 }
 async drain(token){const rows=this.rows("SELECT * FROM objects WHERE state='pending' ORDER BY created_at,key LIMIT 5");for(const row of rows){this.assertLease(token);await this.upload(row,token);}return rows.length>0;}
 async readObject(key){const row=this.rows('SELECT * FROM objects WHERE key=?',key)[0];if(!row||row.state!=='stored')throw Error('evidence_not_durable');return JSON.parse(this.decodeBody(row));}
 async bootstrapReceipt(receipt){
  const r=verifyForecast(receipt),key=targetKey(r.target);if(seedTargets.get(key)!==receipt.sha256)throw Error('not_anchored_seed_receipt');
  const anchor=Date.parse(seed.packages[0].cloudflareManifestTime);if(Date.parse(r.createdAt)>anchor||Date.parse(r.target.gameTime)<=anchor)throw Error('invalid_seed_anchor');
  this.ctx.storage.transactionSync(()=>{const existing=this.rows('SELECT sha FROM receipts WHERE target=?',key)[0];if(existing&&existing.sha!==receipt.sha256)throw Error('first_receipt_conflict');
   const object=this.reserveObject('receipts',receipt);this.sql("INSERT OR IGNORE INTO receipts(target,sha,object_key,game_id,game_time,market,player_id,cycle,next_grade_at,score_body) VALUES(?,?,?,?,?,?,?,'seed-nov14',?,?)",key,receipt.sha256,object.key,r.target.gameId,Date.parse(r.target.gameTime),r.target.market,r.target.playerId,Date.parse(r.target.gameTime)+3*3600000,this.scoreBody(r));
  });
  const row=this.rows('SELECT o.* FROM objects o JOIN receipts r ON r.object_key=o.key WHERE r.target=?',key)[0];if(row.state==='pending')await this.upload(row);
  const seeded=this.rows("SELECT count(*) AS n FROM receipts r JOIN objects o ON o.key=r.object_key WHERE r.cycle='seed-nov14' AND o.state='stored'")[0].n;if(seeded===seedTargets.size)this.setMeta('seedReady',true);return {seeded,required:seedTargets.size,ready:this.ready(),production:false};
 }
 async tick(){
  if(!this.ready())return {state:'bootstrap_pending',production:false};
  const now=this.now(),id=String(Math.floor(now/SLOT));
  this.ctx.storage.transactionSync(()=>{const active=this.rows("SELECT id FROM cycles WHERE state='active' LIMIT 1")[0];if(!active&&!this.rows('SELECT id FROM cycles WHERE id=?',id).length)this.sql("INSERT INTO cycles(id,state,data) VALUES(?,'active',?)",id,JSON.stringify({phase:'grade',retries:0,retryAt:0,startedAt:now,rejections:[]}));});
  const alarm=await this.ctx.storage.getAlarm();if(alarm==null)await this.ctx.storage.setAlarm(now+1000);
  return this.status();
 }
 scoreBody(r){return JSON.stringify({target:r.target,quote:{line:r.quote.line},forecast:{pricing:r.forecast.pricing},baseline:{pricing:r.baseline.pricing}});}
 score(){return scoreRecords(this.rows("SELECT r.score_body,r.score_grade,g.state AS grade_state FROM receipts r JOIN objects o ON o.key=r.object_key LEFT JOIN objects g ON g.key=r.grade_key WHERE o.state='stored' AND o.anchor_status='on_time' ORDER BY r.target").map(r=>({body:JSON.parse(r.score_body),grade:r.grade_state==='stored'?JSON.parse(r.score_grade):null})));}
 async status(){
  return {study,production:false,modelCommit:'007c02b',releaseApproved:false,ready:this.ready(),seedRequired:seedTargets.size,receipts:this.rows('SELECT count(*) AS n FROM receipts')[0].n,grades:this.rows("SELECT count(*) AS n FROM receipts r JOIN objects o ON o.key=r.grade_key WHERE o.state='stored'")[0].n,pendingUploads:this.rows("SELECT count(*) AS n FROM objects WHERE state='pending'")[0].n,lateAnchors:this.rows("SELECT count(*) AS n FROM objects WHERE kind='receipts' AND anchor_status='late'")[0].n,active:this.rows("SELECT id,data FROM cycles WHERE state='active'").map(r=>{const d=JSON.parse(r.data);return {id:r.id,phase:d.phase,retries:d.retries,retryAt:d.retryAt,lastError:d.lastError||null};}),completedCycles:this.rows("SELECT count(*) AS n FROM cycles WHERE state='complete'")[0].n,manifestHead:this.meta('manifestHead'),lastStorageError:this.meta('lastStorageError'),latestSummary:this.meta('latestSummary'),collectionEndsAt:policy.gameTimeBefore};
 }
 saveJob(id,data,token){this.assertLease(token);this.sql("UPDATE cycles SET data=? WHERE id=? AND state='active'",JSON.stringify(data),id);}
 reserveReceipt(receipt,cycle,token){const r=verifyForecast(receipt),key=targetKey(r.target);this.assertLease(token);
  return this.ctx.storage.transactionSync(()=>{this.assertLease(token);if(seedTargets.has(key)||this.rows('SELECT target FROM receipts WHERE target=?',key).length)return false;
   const object=this.reserveObject('receipts',receipt,Date.parse(r.target.gameTime));this.sql('INSERT INTO receipts(target,sha,object_key,game_id,game_time,market,player_id,cycle,next_grade_at,score_body) VALUES(?,?,?,?,?,?,?,?,?,?)',key,receipt.sha256,object.key,r.target.gameId,Date.parse(r.target.gameTime),r.target.market,r.target.playerId,cycle,Date.parse(r.target.gameTime)+3*3600000,this.scoreBody(r));return true;
  });
 }
 async gradeGame(job,id,token){
  const due=this.rows("SELECT r.* FROM receipts r JOIN objects o ON o.key=r.object_key WHERE r.grade_sha IS NULL AND r.next_grade_at<=? AND o.state='stored' AND o.anchor_status='on_time' ORDER BY r.game_time,r.target",this.now());
  if(!due.length){job.phase='discover';this.saveJob(id,job,token);return;}
  const gameId=due[0].game_id,group=due.filter(r=>r.game_id===gameId);let official;
  try{official=await sources.finalBoxscore(gameId);}catch(error){this.assertLease(token);for(const row of group)this.sql('UPDATE receipts SET next_grade_at=?,pending_reason=? WHERE target=?',this.now()+SLOT,safeError(error),row.target);return;}
  this.assertLease(token);
  for(const row of group){const receipt=await this.readObject(row.object_key);let grade;
   try{grade=evidence.gradeNhlShadow(receipt,official,this.now());}catch(error){this.assertLease(token);this.sql('UPDATE receipts SET next_grade_at=?,pending_reason=? WHERE target=?',this.now()+(['OFF','FINAL'].includes(official.gameState)?6*3600000:SLOT),'official_final_or_participant_pending',row.target);continue;}
   this.ctx.storage.transactionSync(()=>{this.assertLease(token);if(this.rows('SELECT grade_sha FROM receipts WHERE target=?',row.target)[0].grade_sha)return;const object=this.reserveObject('grades',{...grade,official});this.sql('UPDATE receipts SET grade_sha=?,grade_key=?,score_grade=?,pending_reason=NULL WHERE target=? AND grade_sha IS NULL',grade.sha256,object.key,JSON.stringify({actual:grade.actual,profit:grade.profit}),row.target);});
  }
 }
 async step(job,id,token){
  if(job.phase==='grade'){await this.gradeGame(job,id,token);return;}
  if(job.phase==='discover'){
   if(this.now()>=Date.parse(policy.gameTimeBefore)){job.phase='finish';this.saveJob(id,job,token);return;}
   const discovered=await sources.discover(this.now());this.assertLease(token);Object.assign(job,discovered,{phase:discovered.games.length?'roster':'finish',cursor:0,players:[]});this.saveJob(id,job,token);return;
  }
  if(job.phase==='roster'){
   if(job.cursor>=job.teams.length){job.phase='candidates';this.saveJob(id,job,token);return;}
   const team=job.teams[job.cursor];try{const players=await sources.roster(team);job.players.push(...players);}catch(error){job.rejections.push({team,reason:safeError(error)});}
   job.cursor++;this.saveJob(id,job,token);return;
  }
  if(job.phase==='candidates'){
   const payload=await sources.feed(this.env.OWLS_INSIGHT_API_KEY),players=new Map();
   for(const market of ['goals','assists'])for(const q of sources.quoteRows(payload,market)){const m=sources.match(q,job.players,job.games);if(!m){job.rejections.push({market,playerName:q.playerName,reason:'unresolved_or_ambiguous_official_player'});continue;}if(!seedTargets.has(targetKey({market,gameId:m.game.gameId,playerId:m.player.playerId}))&&!this.rows('SELECT target FROM receipts WHERE target=?',targetKey({market,gameId:m.game.gameId,playerId:m.player.playerId})).length)players.set(m.player.playerId,m.player);}
   job.warmPlayers=[...players.values()];job.cursor=0;job.phase='history';this.saveJob(id,job,token);return;
  }
  if(job.phase==='history'){
   if(job.cursor>=job.warmPlayers.length){job.phase='capture';job.cursor=0;this.saveJob(id,job,token);return;}
   const player=job.warmPlayers[job.cursor],day=new Date(this.now()).toISOString().slice(0,10);try{const cached=this.rows('SELECT object_key FROM histories WHERE player_id=? AND day=?',player.playerId,day)[0];if(cached)player.historyKey=cached.object_key;else{const history=await sources.history(player,this.now());this.assertLease(token);const object=this.reserveObject('histories',{player,history,retrievedAt:new Date(this.now()).toISOString()});player.historyKey=object.key;this.sql('INSERT OR IGNORE INTO histories(player_id,day,object_key) VALUES(?,?,?)',player.playerId,day,object.key);}}catch(error){job.rejections.push({playerId:player.playerId,reason:safeError(error)});}
   job.cursor++;this.saveJob(id,job,token);return;
  }
  if(job.phase==='capture'){
   if(job.cursor>=job.games.length){job.phase='finish';this.saveJob(id,job,token);return;}
   const game=job.games[job.cursor];if(Date.parse(game.tipoff)<=this.now()+120000){job.rejections.push({gameId:game.gameId,reason:'pregame_window_passed'});job.cursor++;this.saveJob(id,job,token);return;}
   const histories=new Map();for(const player of job.warmPlayers.filter(p=>p.historyKey&&[game.awayAbbr,game.homeAbbr].includes(p.team)))histories.set(player.playerId,(await this.readObject(player.historyKey)).history);
   const fixture=await sources.landing(game.gameId),payload=await sources.feed(this.env.OWLS_INSIGHT_API_KEY),sourceFetchedAt=new Date(this.now()).toISOString();this.assertLease(token);
   const quotes=['goals','assists'].flatMap(market=>sources.quoteRows(payload,market).map(q=>({market,q}))).filter(({q})=>sources.quoteOnGame(q,game));
   const sourceRef=this.reserveObject('sources',{url:'https://api.owlsinsight.com/api/v1/nhl/props',sourceFetchedAt,payloadSha256:evidence.digest(payload),gameId:game.gameId,officialFixture:fixture,quotes});job.sourceRefs=[...(job.sourceRefs||[]),sourceRef];this.saveJob(id,job,token);
   for(const {market,q} of quotes){const match=sources.match(q,job.players,[game]);if(!match){job.rejections.push({market,playerName:q.playerName,gameId:game.gameId,reason:'unresolved_or_ambiguous_official_player'});continue;}const key=targetKey({market,gameId:game.gameId,playerId:match.player.playerId});if(seedTargets.has(key)||this.rows('SELECT target FROM receipts WHERE target=?',key).length)continue;
    const history=histories.get(match.player.playerId);if(!history){job.rejections.push({key,reason:'prior_history_unavailable'});continue;}
    try{this.reserveReceipt(capture(sources.entryFor(q,market,match.player,game,fixture,history,sourceFetchedAt),this.now()),id,token);}catch(error){if(error.message==='lease_lost')throw error;job.rejections.push({key,reason:safeError(error)});}
   }
   job.cursor++;this.saveJob(id,job,token);return;
  }
  if(job.phase==='finish'){
   const references=this.rows('SELECT r.target,r.sha,r.object_key,o.hash,o.uploaded_at,o.anchor_status FROM receipts r JOIN objects o ON o.key=r.object_key WHERE r.cycle=? ORDER BY r.target',id),gradeReferences=this.rows("SELECT r.target,r.grade_sha,r.grade_key FROM receipts r JOIN objects o ON o.key=r.grade_key WHERE o.state='stored' ORDER BY r.target");
   const value={kind:'cw08_scheduled_run_manifest',study,production:false,releaseApproved:false,cycle:id,startedAt:new Date(job.startedAt).toISOString(),completedAt:new Date(this.now()).toISOString(),modelCommit:'007c02b',seedGitAnchor:'27324da',seedPackageSha256:seed.packages[0].packageSha256,previousManifest:this.meta('manifestHead'),receipts:references,grades:gradeReferences,sources:job.sourceRefs||[],histories:(job.warmPlayers||[]).filter(p=>p.historyKey).map(p=>({playerId:p.playerId,key:p.historyKey})),rejections:job.rejections,summary:this.score()};
   const object=this.reserveObject('runs',value);job.manifest=object;job.phase='manifest';this.saveJob(id,job,token);return;
  }
  if(job.phase==='manifest'){
   const stored=this.rows("SELECT state FROM objects WHERE key=?",job.manifest.key)[0];if(stored?.state!=='stored')throw Error('manifest_not_durable');
   this.ctx.storage.transactionSync(()=>{this.assertLease(token);this.setMeta('manifestHead',job.manifest);this.setMeta('latestSummary',this.score());this.sql("UPDATE cycles SET state='complete',data=? WHERE id=?",JSON.stringify({...job,phase:'complete'}),id);});console.log(JSON.stringify({event:'cw08_cycle_complete',cycle:id,manifest:job.manifest,production:false}));return;
  }
  throw Error('invalid_workflow_phase');
 }
 async alarm(){
  if(!this.ready())return;const token=this.claim();if(!token){await this.ctx.storage.setAlarm(Math.max(this.now()+1000,(this.meta('lease')?.until||this.now())+1));return;}
  let next=null;try{
   const row=this.rows("SELECT id,data FROM cycles WHERE state='active' LIMIT 1")[0];if(!row)return;
   const job=JSON.parse(row.data);if(job.retryAt>this.now()){next=job.retryAt;return;}
   if(await this.drain(token)){next=this.now()+1000;return;}
   try{await this.step(job,row.id,token);job.retries=0;job.retryAt=0;delete job.lastError;if(this.rows('SELECT state FROM cycles WHERE id=?',row.id)[0].state==='active')this.saveJob(row.id,job,token);}
   catch(error){this.assertLease(token);job.retries=(job.retries||0)+1;job.retryAt=this.now()+Math.min(SLOT,30000*2**Math.min(5,job.retries-1));job.lastError=safeError(error);console.warn(JSON.stringify({event:'cw08_retry',cycle:row.id,code:job.lastError,retryAt:job.retryAt,production:false}));this.saveJob(row.id,job,token);next=job.retryAt;}
   if(this.rows("SELECT id FROM cycles WHERE state='active' LIMIT 1").length)next=next||this.now()+1000;
  }catch(error){if(this.meta('lease')?.token===token){this.setMeta('lastStorageError',{at:this.now(),code:safeError(error)});const current=this.rows("SELECT id,data FROM cycles WHERE state='active' LIMIT 1")[0];next=this.now()+30000;if(current){const job=JSON.parse(current.data);job.retries=(job.retries||0)+1;job.retryAt=this.now()+Math.min(SLOT,30000*2**Math.min(5,job.retries-1));job.lastError=safeError(error);this.saveJob(current.id,job,token);next=job.retryAt;}}}
  finally{if(this.meta('lease')?.token===token)this.setMeta('lease',null);if(next!=null)await this.ctx.storage.setAlarm(next);}
 }
}
