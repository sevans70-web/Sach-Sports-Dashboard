import fs from 'node:fs/promises';import {gzipSync} from 'node:zlib';import {createHash} from 'node:crypto';import {loadTs} from '../tests/load-ts.mjs';
const {basketballEventObservations}=await loadTs(new URL('../lib/basketball-event-observations.ts',import.meta.url));
const {footballModelObservations}=await loadTs(new URL('../lib/football-model-observations.ts',import.meta.url));
const [candidatesPath,output]=process.argv.slice(2);if(!output)throw Error('Frozen candidates path and NEW output directory required');
await fs.mkdir(output,{recursive:false});await fs.mkdir(output+'/sources');
const hash=b=>createHash('sha256').update(b).digest('hex'),bytes=await fs.readFile(candidatesPath),frozenAt=new Date().toISOString();
await fs.writeFile(output+'/frozen-candidates.json',bytes,{flag:'wx'});
const protocol={frozenAt,candidateSha256:hash(bytes),dates:'20261020-20261026',sports:['nba','nfl'],selection:'Every discovered completed regular-season fixture in the declared date window, with 48h result-availability lag. No outcome-driven inclusion.',classification:'New temporal external check; current revised official data, not a prospective historical-price test.',policy:'No refitting or candidate changes after retrieval. Report all groups, eligibility, exclusions, errors, MAE and distribution error. Compare prior-Q1-history mean and empirical distribution.'};
await fs.writeFile(output+'/protocol.json',JSON.stringify(protocol,null,2),{flag:'wx'});console.log(JSON.stringify(protocol));
const requests=[],errors=[],nba=[],nfl=[];
async function get(url,key){const r=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);const b=Buffer.from(await r.arrayBuffer()),retrievedAt=new Date().toISOString();await fs.writeFile(output+'/sources/'+key+'.json.gz',gzipSync(b));requests.push({url,key,retrievedAt,sha256:hash(b)});return {data:JSON.parse(b),retrievedAt}}
for(const sport of protocol.sports){
 const path=sport==='nba'?'basketball/nba':'football/nfl';
 const boardUrls=sport==='nba'?Array.from({length:7},(_,i)=>`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=202610${20+i}&limit=1000`):[`https://site.api.espn.com/apis/site/v2/sports/${path}/scoreboard?dates=2026&week=7&seasontype=2&limit=1000`];
 const discovered=new Map();let boardIndex=0;
 await Promise.all(Array.from({length:3},async()=>{while(boardIndex<boardUrls.length){const i=boardIndex++,url=boardUrls[i];try{const board=await get(url,sport+'-scoreboard-'+i);for(const e of board.data.events||[])if(e.season?.type===2&&e.status?.type?.completed===true&&Date.parse(e.date)>=Date.parse('2026-10-20T00:00:00Z')&&Date.parse(e.date)<Date.parse('2026-10-27T00:00:00Z')&&Date.parse(e.date)<Date.parse(frozenAt)-48*3600000)discovered.set(String(e.id),e)}catch(e){errors.push({sport,url,error:e.message})}}}));
 const games=[...discovered.values()];let index=0;
 await Promise.all(Array.from({length:3},async()=>{while(index<games.length){const g=games[index++];try{const url=`https://site.api.espn.com/apis/site/v2/sports/${path}/summary?event=${g.id}`,{data,retrievedAt}=await get(url,sport+'-'+g.id);
 if(sport==='nba'){const row=basketballEventObservations(data,String(g.id),retrievedAt);if(row)nba.push(row);else errors.push({sport,gameId:g.id,reason:'ineligible_or_incomplete'});}else nfl.push(...footballModelObservations(data,{sport,gameId:String(g.id),season:String(g.season.year),source:url,retrievedAt},'q1'));
 }catch(e){errors.push({sport,gameId:g.id,error:e.message})}}}));console.log(JSON.stringify({sport,discovered:games.length,nbaEvents:nba.length,nflRows:nfl.length,errors:errors.length}));
}
await fs.writeFile(output+'/nba-events.json',JSON.stringify(nba));await fs.writeFile(output+'/nfl-observations.json',JSON.stringify(nfl));await fs.writeFile(output+'/manifest.json',JSON.stringify({protocol,requests,errors},null,2));
