/** Read provider and official NHL sources directly. Never call dashboard routes. */
import {writeFile,mkdir} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
import {loadTs} from '../tests/load-ts.mjs';
const output=process.argv[2];if(!output)throw Error('Provide a NEW bundle output file');
const {workerRuntimeSecret}=await loadTs(new URL('../lib/worker-runtime-secret.ts',import.meta.url));
const key=workerRuntimeSecret('OWLS_INSIGHT_API_KEY');if(!key)throw Error('OWLS_INSIGHT_API_KEY required in this shadow runner; production configuration is unchanged');
const {providerFetch}=await loadTs(new URL('../lib/provider-fetch.ts',import.meta.url));
const {loadNhlGames,cleanNhlName}=await loadTs(new URL('../lib/nhl.ts',import.meta.url));
const {mainMarketQuotes,uniqueQuoteFixture}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const {nhlOpportunityGames}=await loadTs(new URL('../lib/opportunity-backtest.ts',import.meta.url));
const overview={games:await loadNhlGames()},players=new Map(),rejections=[];
const read=async url=>{const r=await providerFetch(url,{cache:'no-store'});if(!r.ok)throw Error('Official source HTTP '+r.status);return r.json();};
const upcoming=overview.games.filter(g=>g.state==='pre'&&Date.parse(g.tipoff)>Date.now()+120000&&Date.parse(g.tipoff)<Date.now()+48*3600000);
// Use every upcoming team's CURRENT skater roster, including rookies and
// transfers absent from the old statistical baseline. No ranking-board limit.
for(const team of new Set(upcoming.flatMap(g=>[g.awayAbbr,g.homeAbbr]))){
 try{const roster=await read(`https://api-web.nhle.com/v1/roster/${team}/current`);for(const p of [...(roster.forwards||[]),...(roster.defensemen||[])]){
  const playerName=[p.firstName?.default,p.lastName?.default].filter(Boolean).join(' '),k=cleanNhlName(playerName);if(!players.has(k))players.set(k,[]);players.get(k).push({playerId:p.id,playerName,team});
 }}catch(error){rejections.push({team,reason:'current_roster_unavailable'});}
}
const resolvePlayer=q=>{const candidates=(players.get(cleanNhlName(q.playerName))||[]).filter(p=>uniqueQuoteFixture(q,upcoming,p.team,15*60_000));const team=String(q.playerTeam||'').toUpperCase(),exact=candidates.filter(p=>p.team===team);return exact.length===1?exact[0]:candidates.length===1?candidates[0]:null;};
const feed=async()=>{const response=await providerFetch('https://api.owlsinsight.com/api/v1/nhl/props',{headers:{Authorization:`Bearer ${key}`,'x-api-key':key,Accept:'application/json'},cache:'no-store'});if(!response.ok)throw Error('NHL quote provider HTTP '+response.status);return response.json();};
const initial=await feed(),norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,''),aliases={goals:['goals','playergoals','anytimegoalscorer'],assists:['assists','playerassists']};
const quotes=(payload,market)=>mainMarketQuotes(payload,market,p=>aliases[market].includes(norm(p.category??p.market??p.type)));
const candidates=[];
for(const market of ['goals','assists'])for(const q of quotes(initial,market)){
 const player=resolvePlayer(q);if(!player){rejections.push({market,playerName:q.playerName,reason:'unresolved_or_ambiguous_official_player'});continue;}
 const game=uniqueQuoteFixture(q,overview.games,player.team,15*60_000);
 if(!game||game.state!=='pre'||Date.parse(game.tipoff)-Date.now()<=120000||Date.parse(game.tipoff)-Date.now()>48*3600000)continue;
 candidates.push({market,player,game});
}
const histories=new Map(),fixtures=new Map();
for(const c of candidates){
 const pid=String(c.player.playerId),gid=String(c.game.gameId);
 if(!histories.has(pid)){
  try{const rows=[];for(const season of ['20232024','20242025','20252026','20262027']){const url=`https://api-web.nhle.com/v1/player/${pid}/game-log/${season}/2`,raw=await read(url);rows.push(...nhlOpportunityGames(raw,{sport:'nhl',season,playerId:pid,playerName:c.player.playerName,source:url,retrievedAt:new Date().toISOString()}));}histories.set(pid,rows);}catch(error){histories.set(pid,null);rejections.push({playerId:pid,reason:error.message});}
 }
 if(!fixtures.has(gid)){try{fixtures.set(gid,await read(`https://api-web.nhle.com/v1/gamecenter/${gid}/landing`));}catch(error){fixtures.set(gid,null);rejections.push({gameId:gid,reason:error.message});}}
}
// All expensive history reads precede the final quote snapshot. Refresh exact
// fixtures too, so a game that began during collection cannot be captured.
for(const gid of fixtures.keys())if(fixtures.get(gid))fixtures.set(gid,await read(`https://api-web.nhle.com/v1/gamecenter/${gid}/landing`));
const fresh=await feed(),sourceFetchedAt=new Date().toISOString(),entries=[];
for(const market of ['goals','assists'])for(const q of quotes(fresh,market)){
 const player=resolvePlayer(q);if(!player){rejections.push({market,playerName:q.playerName,reason:'unresolved_or_ambiguous_official_player'});continue;}
 const game=uniqueQuoteFixture(q,overview.games,player.team,15*60_000);if(!game)continue;
 const pid=String(player.playerId),gid=String(game.gameId),history=histories.get(pid),officialFixture=fixtures.get(gid);if(!history||!officialFixture)continue;
 entries.push({sourceFetchedAt,target:{sport:'nhl',market,season:String(game.season),playerId:pid,gameId:gid,teamId:player.team,opponentId:officialFixture.homeTeam.abbrev===player.team?officialFixture.awayTeam.abbrev:officialFixture.homeTeam.abbrev,gameTime:game.tipoff,source:'Official NHL upcoming fixture',retrievedAt:sourceFetchedAt},quote:{sport:'nhl',market,period:'game',gameId:gid,playerId:pid,bookmaker:q.sportsbookKey,quoteId:q.quoteId,line:q.line,overPrice:q.overPrice,underPrice:q.underPrice,updatedAt:q.quoteUpdatedAt,mainLine:q.lineType==='main',quoteMarket:market,quotePeriod:'game'},officialFixture,history:history.filter(g=>g.market===market)});
}
await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(output,JSON.stringify({version:1,sourceFetchedAt,entries,rejections,production:false})+'\n',{flag:'wx',mode:0o444});console.log(JSON.stringify({entries:entries.length,rejections:rejections.length,production:false}));
