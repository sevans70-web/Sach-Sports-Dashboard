import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {gzipSync,gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {loadTs} from '../tests/load-ts.mjs';
const output=process.argv[2],sport=process.argv[3]||'nfl';
if(!output||!['nfl','nba'].includes(sport))throw Error('Explicit output directory and nfl/nba required');
const base='https://marvelous-wholeness-production-c8d3.up.railway.app';
const {footballModelObservations}=await loadTs(new URL('../lib/football-model-observations.ts',import.meta.url));
const {quoteProblem}=await loadTs(new URL('../lib/probability-forecast.ts',import.meta.url));
const cache=output+'/sources';await mkdir(cache,{recursive:true});
const digest=b=>createHash('sha256').update(b).digest('hex');
const source=new URL('../model-research/2026-10-19/'+(sport==='nfl'?'nfl-saved-quotes':'nba-context-population')+'/',import.meta.url);
const observations=JSON.parse(gunzipSync(await readFile(new URL('opportunity-observations.json.gz',source))));
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
const requests=[],rejections={},quotes=[],seen=new Set();
function reject(reason){rejections[reason]=(rejections[reason]||0)+1}
async function get(url,provider=false){
 const file=cache+'/'+digest(url)+'.json';
 try{const saved=JSON.parse(await readFile(file,'utf8'));requests.push({url,sha256:digest(JSON.stringify(saved)),cached:true});return saved}catch{}
 if(provider)await new Promise(resolve=>setTimeout(resolve,900));
 const r=await fetch(url,{signal:AbortSignal.timeout(40000),headers:{Accept:'application/json'}});
 if(!r.ok){let error;try{error=(await r.json()).error}catch{};throw Error('HTTP '+r.status+' '+(error||''))}
 const data=await r.json();await writeFile(file,JSON.stringify(data));requests.push({url,sha256:digest(JSON.stringify(data)),cached:false});return data;
}
async function query(day,game,entry){const q=new URLSearchParams({sport,day:String(day)});if(game!=null)q.set('game',String(game));if(entry!=null)q.set('entry',String(entry));return get(base+'/api/research-source?'+q,true)}
async function fixture(providerId,date){
 const m=providerId.match(/^[^:]+:(.+)@(.+)-\d{8}$/);if(!m)return null;
 const league=sport==='nfl'?'football/nfl':'basketball/nba';
 const boardUrl='https://site.api.espn.com/apis/site/v2/sports/'+league+'/scoreboard?dates=';
 const board=await get(boardUrl+date.replaceAll('-','')+'&limit=1000');
 const matchEvents=events=>events.filter(e=>{
  const c=e.competitions?.[0],teams=c?.competitors||[];
  const same=(side,name)=>teams.some(t=>t.homeAway===side&&[t.team?.displayName,t.team?.shortDisplayName,t.team?.abbreviation].some(n=>norm(n)===norm(name)));
  return String(e.date||'').slice(0,10)===date&&c?.status?.type?.completed===true&&same('away',m[1])&&same('home',m[2]);
 });
 let matches=matchEvents(board.events||[]);
 // Owls non-MLB IDs are UTC-dated; ESPN's scoreboard filter uses the local
 // sports day. Night games can therefore require the previous day's board.
 if(!matches.length){const previous=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);const earlier=await get(boardUrl+previous.replaceAll('-','')+'&limit=1000');matches=matchEvents(earlier.events||[])}
 if(matches.length!==1)return null;
 const e=matches[0],gameId=String(e.id);
 if(sport==='nfl'&&!observations.some(r=>r.gameId===gameId)){
  const url='https://site.api.espn.com/apis/site/v2/sports/'+league+'/summary?event='+gameId,payload=await get(url);
  observations.push(...footballModelObservations(payload,{sport,season:String(e.season?.year),gameId,source:url,retrievedAt:new Date().toISOString()},'game',0));
 }
 return {gameId,gameTime:e.date};
}
const firstDay=Number(process.env.RESEARCH_FIRST_DAY||0),lastDay=Number(process.env.RESEARCH_LAST_DAY||6);
const perMarket=Number(process.env.RESEARCH_PLAYERS_PER_MARKET||2);
for(let day=firstDay;day<=lastDay;day++){
 const listing=await query(day);console.log(JSON.stringify({day,date:listing.date,fixtures:listing.games.length}));
 for(let game=0;game<listing.games.length;game++){
  const match=await fixture(listing.games[game],listing.date);if(!match){reject('unmatched_official_fixture');continue}
  const selection=await query(day,game),counts={};
  for(let entry=0;entry<selection.identities.length;entry++){
   const id=selection.identities[entry];counts[id.category]=(counts[id.category]||0)+1;
   if(counts[id.category]>perMarket)continue;
   const rows=observations.filter(r=>r.gameId===match.gameId&&r.market===id.category&&r.playerId===id.playerId&&norm(r.playerName)===norm(id.playerName));
   if(rows.length!==1){reject('unmatched_official_player_market');continue}
   let snapshot;try{snapshot=await query(day,game,entry)}catch(e){
    if(/429|cooling|403|401/.test(e.message))throw e;
    reject(e.message);continue;
   }
   const hi=snapshot.historyIdentity||{};
   if(snapshot.sourceTruncated||hi.gameId!==listing.games[game]||norm(hi.player)!==norm(id.playerName)||hi.category!==id.category||hi.book!==snapshot.book){reject('history_identity_or_truncation');continue}
   const points=[snapshot.opening,...snapshot.history].filter(p=>p.timestamp&&p.line!=null&&p.overPrice!=null&&p.underPrice!=null)
    .sort((a,b)=>Date.parse(b.timestamp)-Date.parse(a.timestamp));
   // A single-prop movement history is the book's main-line sequence, not
   // the result endpoint's mixed closing ladder. Keep that provenance explicit.
   let chosen=null;for(const p of points){
    const q={sport,market:id.category,period:'game',gameId:match.gameId,playerId:id.playerId,bookmaker:snapshot.book,
     quoteId:digest(JSON.stringify([listing.games[game],id.playerId,id.category,snapshot.book,p.timestamp,p.line,p.overPrice,p.underPrice])),
     line:Number(p.line),overPrice:Number(p.overPrice),underPrice:Number(p.underPrice),
     updatedAt:p.timestamp,capturedAt:p.timestamp,decisionAt:p.timestamp,mainLine:true,
     provenance:{source:snapshot.source,providerGameId:listing.games[game],retrievedAt:snapshot.retrievedAt,
      mainLineEvidence:'documented_single_prop_movement_sequence',timestampEvidence:'provider_recorded_change',collection:'retrospective'}};
    if(!quoteProblem(q,rows[0])){chosen=q;break}
   }
   if(!chosen){reject('no_valid_pregame_two_sided_history');continue}
   const key=[chosen.sport,chosen.gameId,chosen.playerId,chosen.market].join('|');if(seen.has(key))throw Error('Duplicate selected opportunity');seen.add(key);quotes.push(chosen);
  }
  await writeFile(output+'/collection-progress.json',JSON.stringify({day,game,quotes:quotes.length,fixtures:new Set(quotes.map(q=>q.gameId)).size,rejections},null,2));
  await checkpoint();console.log(JSON.stringify({day,game,quotes:quotes.length,rejections}));
 }
}
async function checkpoint(){
 const raw=JSON.stringify(observations)+'\n',compressed=gzipSync(raw,{level:9});
 await writeFile(output+'/opportunity-observations.json.gz',compressed);
 await writeFile(output+'/selected-quotes.json',JSON.stringify(quotes,null,2)+'\n');
 await writeFile(output+'/source-manifest.json',JSON.stringify({sport,policy:`first ${perMarket} source-identity-sorted players per supported market; last valid recorded pregame two-sided change per player-fixture-market; fixed dates`,
  collectedAt:new Date().toISOString(),observations:observations.length,quotes:quotes.length,fixtures:new Set(quotes.map(q=>q.gameId)).size,rejections,requests,
  dataSha256:digest(raw),compressedSha256:digest(compressed),quoteDataSha256:digest(JSON.stringify(quotes)),
  limitations:['Retrospective source revisions, not frozen historical vintages.','Provider graded-game discovery can omit ungraded games.','History main-line identity is documented route semantics, not an explicit per-change isMain field.','Provider change timestamps are original source observations; retrievedAt is today, not a claimed historical Sach capture.','Official outcomes verify identity and settlement, never select the sampled price.']},null,2)+'\n');
}
await checkpoint();
