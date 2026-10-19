import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const {basketballModelObservations}=await loadTs(new URL('../lib/basketball-model-observations.ts',import.meta.url));
const root=process.argv[2];if(!root)throw Error('Separate output directory required');
const cache=process.env.MODEL_SOURCE_CACHE||'/tmp/sach-basketball-population-cache';
await mkdir(root,{recursive:true});await mkdir(cache,{recursive:true});
try{await readFile(root+'/source-manifest.json');throw Error('Refusing to overwrite a completed source snapshot')}catch(e){if(e.code!=='ENOENT')throw e}
const digest=b=>createHash('sha256').update(b).digest('hex'),requests=[],errors=[];
async function get(url){const file=cache+'/'+digest(url)+'.json.gz';try{return JSON.parse(gunzipSync(await readFile(file)))}catch{}
 let last;for(let attempt=0;attempt<2;attempt++){try{
  const response=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'Sach-Sports-model-research/1.0'}});
  if(response.status===401||response.status===403)throw Error('Access denied '+response.status);
  if(!response.ok)throw Error('HTTP '+response.status);
  const result={data:await response.json(),retrievedAt:new Date().toISOString(),source:url};await writeFile(file,gzipSync(JSON.stringify(result)));return result;
 }catch(e){last=e;if(/Access denied/.test(e.message))throw e}}
 throw last;
}
async function pool(items,work,n=4){let next=0;await Promise.all(Array.from({length:n},async()=>{while(next<items.length)await work(items[next++])}))}
const dates=[];for(const season of [2025,2026])for(let d=new Date(Date.UTC(season-1,9,1));d<new Date(Date.UTC(season,4,1));d.setUTCDate(d.getUTCDate()+1))dates.push({season:String(season),date:d.toISOString().slice(0,10).replaceAll('-','')});
const fixtures=new Map();let completed=0;
await pool(dates,async job=>{const url='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?'+new URLSearchParams({dates:job.date,limit:'100'});try{
 const r=await get(url);for(const e of r.data.events||[]){if(e.status?.type?.completed!==true||Number(e.season?.type)!==2||String(e.season?.year)!==job.season)continue;
  fixtures.set(String(e.id),{season:job.season,gameId:String(e.id)});}
 requests.push({kind:'discovery',...job,source:url,events:r.data.events?.length||0,retrievedAt:r.retrievedAt});
 }catch(e){errors.push({kind:'discovery',...job,error:e.message})}
 completed++;if(completed%40===0)console.log(JSON.stringify({stage:'discovery',completed,total:dates.length,fixtures:fixtures.size,errors:errors.length}));
});
const observations=[];completed=0;
await pool([...fixtures.values()],async job=>{const source='https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event='+job.gameId;try{
 const r=await get(source),rows=basketballModelObservations(r.data,{...job,sport:'nba',source,retrievedAt:r.retrievedAt});
 observations.push(...rows);requests.push({kind:'summary',...job,source,retrievedAt:r.retrievedAt,observations:rows.length});
 }catch(e){errors.push({kind:'summary',...job,error:e.message})}
 completed++;if(completed%40===0||completed===fixtures.size){const p={stage:'summaries',completed,total:fixtures.size,observations:observations.length,errors:errors.length};await writeFile(root+'/collection-progress.json',JSON.stringify(p));console.log(JSON.stringify(p))}
});
observations.sort((a,b)=>[a.market,a.gameTime,a.gameId,a.playerId].join('|').localeCompare([b.market,b.gameTime,b.gameId,b.playerId].join('|')));
const raw=JSON.stringify(observations)+'\n',compressed=gzipSync(raw,{level:9});await writeFile(root+'/opportunity-observations.json.gz',compressed);
await writeFile(root+'/source-manifest.json',JSON.stringify({createdAt:new Date().toISOString(),population:'All discovered completed regular-season NBA fixtures in two full season windows; no current-roster/player selection.',observations:observations.length,fixtures:fixtures.size,dataSha256:digest(raw),compressedSha256:digest(compressed),requests,errors},null,2)+'\n');
console.log(JSON.stringify({done:true,observations:observations.length,fixtures:fixtures.size,errors:errors.length}));
