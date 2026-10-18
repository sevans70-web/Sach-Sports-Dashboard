import {mkdir,readFile,writeFile} from 'node:fs/promises';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {loadTs} from '../tests/load-ts.mjs';
const {espnOpportunityGames,nhlOpportunityGames,evaluateOpportunityModels}=await loadTs(new URL('../lib/opportunity-backtest.ts',import.meta.url));
const root=process.argv[2]||new URL('../model-research/2026-10-18/',import.meta.url).pathname;
const cache=process.env.MODEL_SOURCE_CACHE||new URL('../.model-source-cache/',import.meta.url).pathname;await mkdir(root,{recursive:true});await mkdir(cache,{recursive:true});
const base='https://marvelous-wholeness-production-c8d3.up.railway.app',errors=[],requests=[],players=new Map();
const routes={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',wnba:'basketball/wnba',cbb:'basketball/mens-college-basketball'};
async function pool(items,work,size=4){let index=0;await Promise.all(Array.from({length:size},async()=>{while(index<items.length)await work(items[index++])}))}
async function get(url){const key=createHash('sha256').update(url).digest('hex'),file=cache+'/'+key+'.json';try{return JSON.parse(await readFile(file,'utf8'))}catch{}
 let response;for(let attempt=0;attempt<2;attempt++){
  const target=attempt&&url.includes('site.web.api.espn.com')?url.replace('site.web.api.espn.com','site.api.espn.com'):url;
  try{response=await fetch(target,{signal:AbortSignal.timeout(20000),headers:{Accept:'application/json','User-Agent':'Sach-Sports-model-research/1.0'}});if(response.ok)break}catch(e){if(attempt)throw e}
 }
 if(!response?.ok)throw Error(`HTTP ${response?.status||'unavailable'}`);
 const data=await response.json(),out={data,source:url,retrievedAt:new Date().toISOString()};await writeFile(file,JSON.stringify(out));return out;
}
const boards=[];for(const sport of ['nfl','cfb','nba','wnba','cbb','nhl'])for(const market of ['nfl','cfb'].includes(sport)?['passing_yards','rushing_yards','receiving_yards','receptions']:sport==='nhl'?['shots_on_goal','goalie_saves']:['points'])boards.push({sport,market});
await pool(boards,async({sport,market})=>{const source=`${base}/api/${sport}/${sport==='cfb'?'rankings-board':'rankings'}?market=${market}`;try{const {data}=await get(source);for(const row of data.rows||[]){const id=String(row.playerId||'');if(!/^\d+$/.test(id))continue;players.set(sport+'|'+id,{sport,playerId:id,playerName:row.playerName})}requests.push({kind:'population',sport,market,rows:data.rows?.length||0,source})}catch(e){errors.push({kind:'population',sport,market,error:e.message})}},3);
const jobs=[...players.values()].flatMap(p=>(p.sport==='nhl'?['20242025','20252026']:['2025','2026']).map(season=>({...p,season}))),games=[];let finished=0;
await pool(jobs,async p=>{const source=p.sport==='nhl'?`https://api-web.nhle.com/v1/player/${p.playerId}/game-log/${p.season}/2`:`https://site.web.api.espn.com/apis/common/v3/sports/${routes[p.sport]}/athletes/${p.playerId}/gamelog?season=${p.season}`;
 try{const result=await get(source),identity={...p,source,retrievedAt:result.retrievedAt};const rows=p.sport==='nhl'?nhlOpportunityGames(result.data,identity):espnOpportunityGames(result.data,identity);games.push(...rows);requests.push({kind:'history',...p,source,retrievedAt:result.retrievedAt,observations:rows.length})}catch(e){errors.push({kind:'history',...p,source,error:e.message})}
 finished++;if(finished%20===0||finished===jobs.length){await writeFile(root+'/collection-progress.json',JSON.stringify({finished,jobs:jobs.length,observations:games.length,errors:errors.length}));console.log(JSON.stringify({finished,jobs:jobs.length,observations:games.length,errors:errors.length}))}
});
games.sort((a,b)=>[a.sport,a.market,a.playerId,a.season,a.gameTime,a.gameId].join('|').localeCompare([b.sport,b.market,b.playerId,b.season,b.gameTime,b.gameId].join('|')));
const data=JSON.stringify(games)+'\n',compressed=gzipSync(data,{level:9});await writeFile(root+'/opportunity-observations.json.gz',compressed);
const manifest={createdAt:new Date().toISOString(),population:'Current live ranking-board player IDs; selected sample, not a historical league census.',players:[...players.values()],dataSha256:createHash('sha256').update(data).digest('hex'),compressedSha256:createHash('sha256').update(compressed).digest('hex'),observations:games.length,requests,errors};await writeFile(root+'/source-manifest.json',JSON.stringify(manifest,null,2)+'\n');
const report=evaluateOpportunityModels(games);report.sourceDataSha256=manifest.dataSha256;report.collectionErrors=errors.length;await writeFile(root+'/opportunity-backtest.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({done:true,players:players.size,observations:games.length,errors:errors.length,groups:report.groups}));
