import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const {footballModelObservations}=await loadTs(new URL('../lib/football-model-observations.ts',import.meta.url));
const sport=process.env.MODEL_SPORT||'nfl';if(!['nfl','cfb'].includes(sport))throw Error('Unsupported football sport');
if(sport==='cfb'&&!process.argv[2])throw Error('CFB collection requires a separate explicit output directory');
const providerSport=sport==='cfb'?'college-football':'nfl';
const output=process.argv[2]||new URL('../model-research/2026-10-19/nfl-population/',import.meta.url).pathname;
const cache=process.env.MODEL_SOURCE_CACHE||'/tmp/sach-football-population-cache';
const period=process.env.MODEL_QUARTERS==='1'?'q1':'game';
if(period==='q1'&&!process.argv[2])throw Error('Quarter collection requires a separate explicit output directory');
await mkdir(output,{recursive:true});await mkdir(cache,{recursive:true});
const digest=x=>createHash('sha256').update(x).digest('hex'),errors=[],requests=[],events=new Map(),observations=[];
async function get(url){
 const file=cache+'/'+digest(url)+'.json';try{return JSON.parse(await readFile(file,'utf8'))}catch{}
 const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'Sach-Sports-model-research/2.0'}});
 if(!r.ok)throw Error('HTTP '+r.status);const data=await r.json(),result={data,source:url,retrievedAt:new Date().toISOString()};
 await writeFile(file,JSON.stringify(result));return result;
}
async function pool(items,work,size=3){let index=0;await Promise.all(Array.from({length:size},async()=>{while(index<items.length)await work(items[index++])}))}
// Explicit week + dates=season is required: year= is ignored by this endpoint.
// Calendar-year ranges also include games from the previous NFL season.
const seasons=process.env.MODEL_SEASONS?process.env.MODEL_SEASONS.split(',').map(Number):(period==='q1'?[2024,2025,2026]:[2025,2026]);
if(seasons.some(s=>!Number.isInteger(s)||s<2020||s>2026))throw Error('Invalid study season');
const weeks=seasons.flatMap(season=>Array.from({length:sport==='cfb'?16:18},(_,i)=>({season:String(season),week:i+1})));
await pool(weeks,async({season,week})=>{
 const url=`https://site.api.espn.com/apis/site/v2/sports/football/${providerSport}/scoreboard?${sport==='cfb'?'groups=80&':''}dates=${season}&week=${week}&seasontype=2&limit=1000`;
 try{const {data,retrievedAt}=await get(url);
  if(String(data.season?.year)!==season||Number(data.season?.type)!==2||Number(data.week?.number)!==week)throw Error('Scoreboard season/week mismatch');
  let accepted=0;for(const e of data.events||[]){
   if(String(e.season?.year)!==season||Number(e.season?.type)!==2||e.status?.type?.completed!==true||Date.parse(e.date)>=Date.parse(retrievedAt)-48*3600000)continue;
   events.set(String(e.id),{gameId:String(e.id),season});accepted++;
  }
  requests.push({kind:'scoreboard',season,week,source:url,retrievedAt,accepted});
 }catch(e){errors.push({kind:'scoreboard',season,week,source:url,error:e.message})}
});
console.log(JSON.stringify({discoveredGames:events.size,scoreboardErrors:errors.length}));
let done=0;
await pool([...events.values()],async identity=>{
 const url=`https://site.api.espn.com/apis/site/v2/sports/football/${providerSport}/summary?event=${identity.gameId}`;
 try{const {data,retrievedAt}=await get(url),rows=footballModelObservations(data,{...identity,sport,source:url,retrievedAt},period);
  if(!rows.length&&period==='game')throw Error('No eligible official summary observations');
  observations.push(...rows);requests.push({kind:'summary',...identity,source:url,retrievedAt,observations:rows.length});
 }catch(e){errors.push({kind:'summary',...identity,source:url,error:e.message})}
 done++;if(done%25===0||done===events.size)console.log(JSON.stringify({completed:done,games:events.size,observations:observations.length,errors:errors.length}));
});
observations.sort((a,b)=>[a.market,a.playerId,a.season,a.gameTime,a.gameId].join('|').localeCompare([b.market,b.playerId,b.season,b.gameTime,b.gameId].join('|')));
const data=JSON.stringify(observations)+'\n',compressed=gzipSync(data,{level:9});
await writeFile(output+'/opportunity-observations.json.gz',compressed);
await writeFile(output+'/source-manifest.json',JSON.stringify({population:period==='q1'?'Reconciled first-quarter yards and quarter workload from completed official football games; incomplete tape excluded; historical full-game workload retained only as a prior-role feature.':'All discovered completed regular-season football games, all official players with reported positive market workload; 48-hour publication lag convention.',observations:observations.length,discoveredGames:events.size,completedSummaries:requests.filter(r=>r.kind==='summary').length,dataSha256:digest(data),compressedSha256:digest(compressed),requests,errors},null,2)+'\n');
console.log(JSON.stringify({done:true,observations:observations.length,errors:errors.length}));
