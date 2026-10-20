import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gunzipSync,gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const output=process.argv[2];if(!output)throw Error('Explicit new output directory required');
const key=process.env.DUNK_API_KEY?.trim();if(!key)throw Error('DUNK_API_KEY is required; no account or payment will be created');
const {nbaArchiveQuotes}=await loadTs(new URL('../lib/nba-archive-quotes.ts',import.meta.url));
const bytes=await readFile(new URL('../model-research/2026-10-19/nba-context-population/opportunity-observations.json.gz',import.meta.url));
const observations=JSON.parse(gunzipSync(bytes)),hash=b=>createHash('sha256').update(b).digest('hex');
// Predetermined chronological census: 32 fitting fixtures + 12 later fixtures.
// At ten credits per uncached fixture this hard cap is 440 credits. No top-up,
// retry of charged requests, wallet action, or unbounded pagination is performed.
const fixtures=[...new Map(observations.filter(g=>g.sport==='nba'&&g.gameTime>='2026-03-20'&&g.gameTime<'2026-04-08').map(g=>[g.gameId,{id:g.gameId,time:g.gameTime}])).values()].sort((a,b)=>a.time.localeCompare(b.time)||a.id.localeCompare(b.id));
const selected=[...fixtures.filter(g=>Date.parse(g.time)+48*3600000<Date.parse('2026-04-05')).slice(0,32),...fixtures.filter(g=>g.time>'2026-04-05T00:00:00Z').slice(0,12)];
if(selected.length!==44)throw Error('Insufficient fixed official fixture census');
try{await readFile(output+'/source-manifest.json');throw Error('Refusing to overwrite completed collection')}catch(e){if(e.code!=='ENOENT')throw e}
await mkdir(output+'/sources',{recursive:true});const quotes=[],requests=[],rejections={};
for(const f of selected){
 const path=output+'/sources/'+f.id+'.json';let payload,cached=false;
 try{payload=JSON.parse(await readFile(path,'utf8'));cached=true}catch{
  const r=await fetch('https://mcp.dunkapi.com/v1/get_player_props',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key},body:JSON.stringify({game_id:f.id,snapshot_type:'closing'}),signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw Error('NBA archive returned '+r.status+'; stopped without retry');
  payload=await r.json();await writeFile(path,JSON.stringify(payload));
 }
 const result=nbaArchiveQuotes(payload,observations,f.id,new Date().toISOString());quotes.push(...result.quotes);
 for(const [reason,n]of Object.entries(result.rejected))rejections[reason]=(rejections[reason]||0)+n;
 requests.push({gameId:f.id,sha256:hash(JSON.stringify(payload)),cached});
 await writeFile(output+'/collection-progress.json',JSON.stringify({fixtures:requests.length,quotes:quotes.length,rejections},null,2));
 console.log(JSON.stringify({fixtures:requests.length,quotes:quotes.length}));
}
const raw=JSON.stringify(observations)+'\n',compressed=gzipSync(raw,{level:9});
await writeFile(output+'/opportunity-observations.json.gz',compressed);await writeFile(output+'/selected-quotes.json',JSON.stringify(quotes,null,2)+'\n');
await writeFile(output+'/source-manifest.json',JSON.stringify({sport:'nba',policy:'First 32 official eligible March 20–April 2 fixtures, then first 12 April 5–7 fixtures; all supported standard markets; fixed book preference',collectedAt:new Date().toISOString(),observations:observations.length,quotes:quotes.length,fixtures:new Set(quotes.map(q=>q.gameId)).size,requests,rejections,dataSha256:hash(raw),compressedSha256:hash(compressed),quoteDataSha256:hash(JSON.stringify(quotes)),limitations:['Retrospective revised source, not frozen Sach pregame captures.','Standard named player markets supply main-line semantics; ambiguous same-book thresholds are rejected.','Availability, coverage and real payload compatibility require a credentialed run.','Evaluation remains research and cannot approve its own betting model.']},null,2)+'\n');
