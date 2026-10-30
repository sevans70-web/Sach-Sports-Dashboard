// Deterministic point-forecast packaging; never edits the live model registry.
const fs=require('fs'),z=require('zlib'),crypto=require('crypto');
const src=(process.argv[2]||'').replace(/\/$/,'')+'/',out=(process.argv[3]||'').replace(/\/$/,'')+'/',asOf=process.argv[4];
if(!process.argv[2]||!process.argv[3]||!Number.isFinite(Date.parse(asOf)))throw Error('Candidate directory, NEW output directory and snapshot timestamp required');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex'),candidate=fs.readFileSync(src+'quarter-candidates.json.gz'),p=JSON.parse(z.gunzipSync(candidate)),e=JSON.parse(fs.readFileSync(src+'evaluation.json'));
if(hash(candidate)!==e.candidateSha256)throw Error('Candidate checksum mismatch');
const models=p.models.map(m=>({...m,residuals:[]}));
for(const model of models){const r=e.reports.find(r=>r.group===model.group);if(!r?.pointErrorImproved||r.testFixtures<40)throw Error('Development point-error check not met '+model.group)}
const fixtures=[],players=[],markets=[],fi=new Map(),pi=new Map(),mi=new Map();
const ix=(xs,map,key,value)=>{if(!map.has(key)){map.set(key,xs.length);xs.push(value)}return map.get(key)};
const rows=p.observations.map(g=>[ix(fixtures,fi,g.gameId,[g.gameId,g.gameTime,g.season,g.retrievedAt]),ix(players,pi,g.playerId+'|'+g.teamId,[g.playerId,g.teamId]),ix(markets,mi,g.sport+'|'+g.market,[g.sport,g.market]),g.actual,g.role,g.starter?1:0]);
const bytes=z.gzipSync(JSON.stringify({version:2,models,fixtures,players,markets,rows}),{level:9});
const manifest={version:1,sha256:hash(bytes),asOf,observations:rows.length,groups:models.map(m=>m.group),modelId:'direct-quarter-history-ridge-v1',sourceCandidateSha256:e.candidateSha256,nbaSourceManifestSha256:e.nbaSourceManifestSha256,nflSourceSha256:e.nflSourceSha256,forecastType:'point_expectation',validatedForBetting:false,probabilitiesAvailable:false};
fs.mkdirSync(out,{recursive:false});fs.writeFileSync(out+'quarter-snapshot.json.gz',bytes,{flag:'wx'});fs.writeFileSync(out+'quarter-manifest.json',JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({bytes:bytes.length,observations:rows.length,sha256:hash(bytes)}));
