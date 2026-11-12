import {cardModelProjection} from '@/lib/saved-model-pick';
import {rankingGameForRow} from "@/lib/ranking-card-state";
const number=(v:any)=>v==null||(typeof v==='string'&&!v.trim())||typeof v==='boolean'?null:Number.isFinite(Number(v))?Number(v):null;
const fmt=(v:number)=>Number(v.toFixed(1)).toString();
export function propIntelligence(row:any,sport:string,market:string){
 const label=String(row.marketLabel||market.replaceAll('_',' '));
 const line=row.quoteVerified===true?number(row.sportsbookLine):null,baseline=number(row.historicalBaseline??row.modelProjection);
 const sample=(row.researchCohort?.observations||[]).filter((g:any)=>g.included===true&&number(g.value)!=null&&Date.parse(g.date)<Date.parse(row.gameTime)).slice(-10);
 const facts:string[]=[];
 if(sample.length){
  const values=sample.map((g:any)=>Number(g.value));
  facts.push(`${sample.length} qualifying prior appearances: ${fmt(Math.min(...values))}–${fmt(Math.max(...values))} ${label.toLowerCase()}.`);
  const workloads=sample.map((g:any)=>number(g.workload)).filter((v:any):v is number=>v!=null);
  if(/passing|pass_completions/.test(market)&&workloads.length===sample.length)facts.push(`Average ${fmt(workloads.reduce((a:number,b:number)=>a+b,0)/workloads.length)} passing attempts in this sample; that is historical workload, not today's expected attempts.`);
  if(line!=null&&!/first|anytime/.test(market))facts.push(`${values.filter((v:number)=>v>line).length} of these ${values.length} results exceeded today's recorded ${fmt(line)} line; this is a sample comparison, not a win probability.`);
 }else{
  const games=number(row.projectionGames??row.gamesPlayed);
  if(games!=null&&games>0)facts.push(`Stored historical baseline uses ${fmt(games)} reported appearances; comparable role and dated sample coverage are not established here.`);
  else facts.push('A dated, comparable appearance sample is not available on this card.');
 }
 if(baseline!=null&&!market.startsWith('q1_'))facts.push(line!=null?`Historical baseline ${fmt(baseline)} is ${fmt(Math.abs(baseline-line))} ${baseline>=line?'above':'below'} the recorded ${fmt(line)} line. This difference is not a modeled betting edge.`:`Historical baseline: ${fmt(baseline)}. A qualifying bookmaker line is unavailable for comparison.`);
 if(row.researchCohort?.excluded>0)facts.push(`${row.researchCohort.excluded} appearances excluded by the research cohort rules; exclusions remain available below.`);
 if(row.quoteVerified)facts.push(`${row.sportsbook||'Recorded bookmaker'} supplies the displayed ${row.lineType==='scorer'?'scorer':'main'} quote; quote verification does not validate a pick.`);
 const missing=sport==='nfl'||sport==='cfb'?'Current role, expected attempts/carries/targets, teammate availability, matchup, weather and game script are not jointly modeled.':sport==='nhl'?'Expected ice time, line assignment, opponent and goalie availability are not jointly modeled.':'Expected minutes, usage, rotation changes, teammate availability and opponent are not jointly modeled.';
 const blockers=[...(!row.quoteVerified?['Qualifying quote unavailable']:[]),...(market.startsWith('q1_')?['Quarter-specific forecast unvalidated']:/first|anytime/.test(market)?['Scorer model unvalidated']:['Forecast model unvalidated'])];
 return {facts,face:facts[0],missing,blockers,rankingBasis:`#${row.rank||'—'} is the current research-board position. The underlying ordering is unvalidated and does not establish betting value.`,decision:row.recommendationEligible?'Validated recommendation':`NO PICK · ${blockers.join(' · ')}`,giReason:'GI is withheld until forecast probabilities and their calibration are validated.'};
}
export function gameIntelligence(game:any,context:any={},injuries:any[]=[]){
 const facts:string[]=[],away=game.awayAbbr||game.awayTeam,home=game.homeAbbr||game.homeTeam;
 const a=number(game.awayScore),h=number(game.homeScore);
 if(game.state!=='pre'&&a!=null&&h!=null){facts.push(a===h?`${away} and ${home} are tied ${fmt(a)}–${fmt(h)}.`:`${a>h?away:home} ${game.state==='post'?'won':'leads'} by ${fmt(Math.abs(a-h))}; ${fmt(a+h)} combined ${game.sport==='nhl'?'goals':'points'} ${game.state==='post'?'at final':'so far'}.`)}
 if(game.awayRecord||game.homeRecord)facts.push(`Records entering this matchup: ${away} ${game.awayRecord||'unavailable'}; ${home} ${game.homeRecord||'unavailable'}.`);
 if(context.spread||number(context.total)!=null)facts.push(`Reported game market: ${context.spread||'spread unavailable'}${number(context.total)!=null?` · total ${fmt(Number(context.total))}`:''}. Full-game market context does not establish a player-prop edge.`);
 if(injuries.length)facts.push(`Listed availability concerns: ${injuries.slice(0,3).map(r=>`${r.playerName} (${r.status})`).join('; ')}${injuries.length>3?`; ${injuries.length-3} more listed`:''}. Workload effects have not been estimated.`);
 if(context.weather)facts.push(`Reported conditions: ${context.weather}.`);
 if(!facts.length)facts.push(`${game.awayTeam} visit ${game.homeTeam}${game.venue?` at ${game.venue}`:''}.`);
 return facts;
}
/** Guarded nulls are intentional: legacy aliases must not restore suppressed values. */
export function gameRankingEvidence(row:any,market:string){
 if(row.integrityVersion===1)return {sportsbookLine:row.quoteVerified===true?number(row.sportsbookLine):null,modelProjection:cardModelProjection(row),giScore:row.recommendationEligible===true?number(row.giScore):null,modelProbability:row.recommendationEligible===true?number(row.modelProbability):null};
 return {sportsbookLine:number(row.sportsbookLine??row.sportsbook_line??row.marketLine??row.market_line??row.line),modelProjection:number(row.modelProjection??row.model_projection??row.projection??row.perGame??row.modelTarget),giScore:number(row.giScore??row.gi_score??row.score),modelProbability:number(row.modelProbability??row.model_probability??row.probability??row.home_run_probability??row.hr_probability)};
}

export function gameRankingMatches(row:any,game:any){return rankingGameForRow(row,[game])!=null}
export function gameRankingTeam(row:any,side:'away'|'home',game:any){
 if(!gameRankingMatches(row,game))return false;
 const expectedId=String(game[side+'TeamId']||'');
 if(row.teamId&&expectedId)return String(row.teamId)===expectedId;
 const clean=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const names=[row.teamName,row.teamAbbr,row.team_abbreviation].map(clean).filter(Boolean),targets=[game[side+'Team'],game[side+'Abbr']].map(clean).filter(Boolean);
 return names.some(n=>targets.includes(n));
}


/** Market-specific matchup facts from the player's dated pregame history. */
export function playerMatchupNotes(row:any,market:string,history:import("@/lib/player-card-history").PlayerHistoryPoint[]){
 const normalize=(name:unknown)=>String(name||'').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g,'');
 const teams=String(row.matchup||'').split(/\s+@\s+|\s+vs\.?\s+/i);
 const team=normalize(row.teamName);
 const own=teams.findIndex(name=>normalize(name)===team);
 const opponent=String(row.opponentName||(teams.length===2&&own>=0?teams[1-own]:''));
 const aliases=[opponent,...(Array.isArray(row.opponentAliases)?row.opponentAliases:[])].map(normalize).filter(Boolean);
 const against=(point:{opponent?:string})=>{
  const name=normalize(point.opponent);
  return Boolean(name)&&aliases.some(alias=>alias===name||(name.length>=5&&alias.endsWith(name)));
 };
 const cutoff=Date.parse(row.gameTime||'');
 const day=Number.isFinite(cutoff)?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Toronto'}).format(cutoff):'';
 const prior=history.filter(point=>Number.isFinite(point.value)&&Date.parse(point.date||'')<cutoff&&
  (!row.gameId||String(point.gameId)!==String(row.gameId))&&
  (!/^\d{4}-\d{2}-\d{2}$/.test(point.date!)||point.date!<day))
  .sort((a,b)=>Date.parse(a.date!)-Date.parse(b.date!));
 const meetings=prior.filter(against).slice(-5);
 const other=prior.filter(point=>point.opponent&&!against(point)).slice(-5);
 const average=(points:typeof prior)=>fmt(points.reduce((sum,point)=>sum+point.value,0)/points.length);
 const line=row.quoteVerified===true?number(row.sportsbookLine):null;
 const unit=market.replace(/^q1_/,'').replaceAll('_',' ');
 const notes:string[]=[];
 if(meetings.length){
  const results=meetings.map(point=>fmt(point.value)).join(', ');
  const againstLine=line!=null&&!/first|anytime/.test(market)
   ? ` At the recorded ${fmt(line)} line, ${meetings.filter(point=>point.value>line).length} went over, ${meetings.filter(point=>point.value<line).length} went under${meetings.some(point=>point.value===line)?`, and ${meetings.filter(point=>point.value===line).length} landed on the line`:''}.`:'';
  notes.push(`Against ${opponent}: ${results} ${unit} across ${meetings.length} prior ${meetings.length===1?'meeting':'meetings'}${other.length?`, averaging ${average(meetings)} versus ${average(other)} in the last ${other.length} games against other opponents`:''}.${againstLine}`);
 }
 const recent=prior.slice(-5);
 const workload=market.startsWith('q1_')?null:row.sport==='nhl'?{label:'time on ice',unit:'minutes',value:(point:typeof prior[number])=>point.iceTimeSeconds==null?null:point.iceTimeSeconds/60}:
  row.sport==='nba'?{label:'court time',unit:'minutes',value:(point:typeof prior[number])=>number(point.minutes)}:
  /^(passing_|qb_passing)/.test(market)?{label:'passing volume',unit:'attempts',value:(point:typeof prior[number])=>number(point.workload)}:null;
 if(workload){
  const values=recent.map(workload.value).filter((value):value is number=>value!=null&&value>0);
  if(values.length>=3)notes.push(`Recent ${workload.label}: ${fmt(values.reduce((sum,value)=>sum+value,0)/values.length)} ${workload.unit} per game across ${values.length} recorded appearances (range ${fmt(Math.min(...values))}–${fmt(Math.max(...values))}).`);
 }
 const evidence=row.opponentDefense||row.matchupEvidence;
 if(row.gameId&&evidence?.verified===true&&String(evidence.gameId)===String(row.gameId)&&evidence.market===market&&
  typeof evidence.summary==='string'&&evidence.summary.trim())notes.push(evidence.summary.trim());

 // An injury report confirms who is out. Show an effect only when the
 // evidence identifies this player's role and the selected market.
 const impact=row.roleImpact;
 if(row.gameId&&row.playerId&&impact?.verified===true&&String(impact.gameId)===String(row.gameId)&&
  String(impact.playerId)===String(row.playerId)&&impact.market===market&&impact.source&&
  typeof impact.summary==='string'&&impact.summary.trim())notes.push(impact.summary.trim());
 return notes;
}

/** Resolve full names and abbreviations from the official fixture roster. */
export async function playerFixtureOpponent(sport:string,gameId:string,playerId:string,team:string,league:string,signal:AbortSignal){
 if(!gameId||!playerId)return null;
 try{
  const query=new URLSearchParams({sport,gameId,league});
  const response=await fetch('/api/game-slate-detail?'+query,{signal,cache:'no-store'});
  if(!response.ok)return null;
  const payload=await response.json();
  if(payload?.success!==true||String(payload.gameId)!==gameId||!Array.isArray(payload.rosters))return null;
  const normalize=(value:unknown)=>String(value||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const rosters=payload.rosters;
  if(rosters.length!==2)return null;
  const byTeam=rosters.filter((row:any)=>[row.teamName,row.teamAbbr].some(value=>normalize(value)===normalize(team)));
  const byPlayer=rosters.filter((row:any)=>row.players?.some((player:any)=>String(player.playerId)===playerId));
  const own=byTeam.length===1?byTeam[0]:byPlayer.length===1?byPlayer[0]:null;
  if(!own||(byPlayer.length===1&&byPlayer[0]!==own))return null;
  const opponent=rosters.find((row:any)=>row!==own);
  return opponent?.teamName?{name:opponent.teamName,aliases:[opponent.teamAbbr]}:null;
 }catch{return null;}
}
