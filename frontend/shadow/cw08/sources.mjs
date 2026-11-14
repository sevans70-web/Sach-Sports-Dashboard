import {mainMarketQuotes,uniqueQuoteFixture,quoteMatchesFixture} from '../../lib/main-market-quotes.ts';
import {nhlOpportunityGames} from '../../lib/opportunity-backtest.ts';
import {nhlTeamAliases} from '../../lib/nhl-team-aliases.ts';
import {policy} from './domain.mjs';
const NHL='https://api-web.nhle.com/v1',OWLS='https://api.owlsinsight.com/api/v1/nhl/props';
const clean=v=>String(v||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export async function readSource(url,key){
 if(!(url.startsWith(NHL+'/')||url===OWLS))throw Error('forbidden_source');
 let current=url,r;
 for(let hop=0;hop<=3;hop++){
  r=await fetch(current,{method:'GET',redirect:'manual',headers:url===OWLS?{Authorization:`Bearer ${key}`,'x-api-key':key,Accept:'application/json'}:{Accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if([301,302,303,307,308].includes(r.status)&&url!==OWLS){
   const location=r.headers.get('Location');await r.body?.cancel();if(!location)throw Error('source_redirect_missing');
   const next=new URL(location,current);if(next.origin!=='https://api-web.nhle.com'||!next.pathname.startsWith('/v1/')||next.username||next.password)throw Error('source_redirect_forbidden');
   if(hop===3)throw Error('source_redirect_limit');current=next.href;continue;
  }
  if(!r.ok){await r.body?.cancel();throw Error('source_http_'+r.status);}break;
 }
 // These endpoints are fixed public/provider contracts. Cap responses before parsing.
 const reader=r.body.getReader(),chunks=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16*1024*1024){await reader.cancel();throw Error('source_response_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(size);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export async function discover(now){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now)),part=t=>parts.find(p=>p.type===t).value,day=part('year')+'-'+part('month')+'-'+part('day'),schedule=await readSource(NHL+'/schedule/'+day),standings=await readSource(NHL+'/standings/'+day),games=[];
 const seen=new Set();for(const d of schedule.gameWeek||[])for(const g of d.games||[]){
  const time=Date.parse(g.startTimeUTC);if(seen.has(String(g.id))||g.gameType!==2||!['FUT','PRE'].includes(g.gameState)||!Number.isFinite(time)||time<=now+120000||time>now+48*3600000||time<Date.parse(policy.gameTimeFrom)||time>=Date.parse(policy.gameTimeBefore))continue;
  seen.add(String(g.id));const aliases=nhlTeamAliases(standings,String(g.season)),a=g.awayTeam,h=g.homeTeam;
  const full=t=>t.name?.default||[t.placeName?.default,t.commonName?.default].filter(Boolean).join(' ')||t.abbrev;
  games.push({gameId:String(g.id),season:String(g.season),tipoff:g.startTimeUTC,awayAbbr:a.abbrev,homeAbbr:h.abbrev,awayTeam:full(a),homeTeam:full(h),awayTeamAliases:aliases.get(a.abbrev),homeTeamAliases:aliases.get(h.abbrev),state:'pre'});
 }
 return {games,teams:[...new Set(games.flatMap(g=>[g.awayAbbr,g.homeAbbr]))]};
}
export async function roster(team){
 const raw=await readSource(NHL+'/roster/'+team+'/current');
 if(!Array.isArray(raw.forwards)||!Array.isArray(raw.defensemen))throw Error('official_roster_missing');
 return [...raw.forwards,...raw.defensemen].map(p=>({playerId:String(p.id),playerName:[p.firstName?.default,p.lastName?.default].filter(Boolean).join(' '),team}));
}
export function quoteRows(payload,market){const aliases=market==='goals'?['goals','playergoals','anytimegoalscorer']:['assists','playerassists'];return mainMarketQuotes(payload,market,p=>aliases.includes(clean(p.category??p.market??p.type)));}
export const feed=key=>readSource(OWLS,key);
export function match(q,players,games){
 const candidates=players.filter(p=>clean(p.playerName)===clean(q.playerName)&&uniqueQuoteFixture(q,games,p.team,15*60000));
 const exact=candidates.filter(p=>p.team===String(q.playerTeam||'').toUpperCase()),player=exact.length===1?exact[0]:candidates.length===1?candidates[0]:null;
 if(!player)return null;const game=uniqueQuoteFixture(q,games,player.team,15*60000);return game?{player,game}:null;
}
export async function history(player,now){
 const rows=[];for(const season of ['20232024','20242025','20252026','20262027']){const url=NHL+`/player/${player.playerId}/game-log/${season}/2`,raw=await readSource(url);if(!Array.isArray(raw.gameLog))throw Error('official_history_missing');rows.push(...nhlOpportunityGames(raw,{sport:'nhl',season,playerId:player.playerId,playerName:player.playerName,source:url,retrievedAt:new Date(now).toISOString()}));}
 return rows.filter(g=>['goals','assists'].includes(g.market));
}
export const landing=id=>readSource(NHL+'/gamecenter/'+id+'/landing');
export const finalBoxscore=id=>readSource(NHL+'/gamecenter/'+id+'/boxscore');
export function entryFor(q,market,player,game,officialFixture,history,sourceFetchedAt){return {sourceFetchedAt,target:{sport:'nhl',market,season:String(game.season),playerId:player.playerId,gameId:game.gameId,teamId:player.team,opponentId:officialFixture.homeTeam?.abbrev===player.team?officialFixture.awayTeam?.abbrev:officialFixture.homeTeam?.abbrev,gameTime:game.tipoff,source:'Official NHL upcoming fixture',retrievedAt:sourceFetchedAt},quote:{sport:'nhl',market,period:'game',gameId:game.gameId,playerId:player.playerId,bookmaker:q.sportsbookKey,quoteId:q.quoteId,line:q.line,overPrice:q.overPrice,underPrice:q.underPrice,updatedAt:q.quoteUpdatedAt,mainLine:q.lineType==='main',quoteMarket:market,quotePeriod:'game'},officialFixture,history:history.filter(g=>g.market===market)};}

export const quoteOnGame=(q,game)=>quoteMatchesFixture(q,game,15*60000);
