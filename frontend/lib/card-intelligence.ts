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


/** Evidence-based context shared by compact rankings and full player profiles.
 * An absence is a possible role change, never proof of extra minutes or targets.
 */
export function playerMatchupAndAbsence(row:any,sport:string,market:string,history:number[]=[]){
 const numeric=(x:any)=>x==null||x===''||!Number.isFinite(Number(x))?null:Number(x);
 const fmt=(x:number)=>Number(x.toFixed(1)).toString();
 const line=numeric(row?.sportsbookLine),values=history.filter(x=>Number.isFinite(x)).slice(-5);
 const notes:string[]=[];
 if(values.length>=3){
  const avg=values.reduce((a,b)=>a+b,0)/values.length;
  notes.push('What the recent form means: '+fmt(avg)+' '+market.replaceAll('_',' ')+' per game in the last '+values.length+' recorded appearances'+(line!=null?'; the displayed line is '+fmt(line)+'.':' (no verified comparison line).')+' A historical average is not a prediction.');
 }else notes.push('At least three dated appearances are needed before recent form can be assessed reliably.');
 const opp=row?.opponentDefense||row?.matchupEvidence;
 if(opp?.verified===true&&opp?.gameId&&String(opp.gameId)===String(row?.gameId)&&typeof opp.summary==='string'&&opp.summary.trim()){
  notes.push('Opponent matchup: '+opp.summary.trim());
 }else notes.push('Opponent matchup: defensive allowance, positional coverage and head-to-head context are not verified for this fixture. No favorable matchup is claimed.');
 const verifiedAbsences=(Array.isArray(row?.teammateAvailability)?row.teammateAvailability:Array.isArray(row?.teammateInjuries)?row.teammateInjuries:[]).filter((item:any)=>
  item && item.verified===true && item.playerName &&
  item.gameId && row?.gameId && String(item.gameId)===String(row.gameId) &&
  item.teamId && row?.teamId && String(item.teamId)===String(row.teamId) &&
  /^(out|inactive|injured reserve|suspended|dnp)$/i.test(String(item.status||'')) &&
  (item.source||item.reportedAt));
 const absence=verifiedAbsences.slice(0,3).map((item:any)=>{
  const explicit=numeric(item?.verifiedMinutesChange);
  const effect=explicit!=null&&item?.minutesImpactVerified===true?
   'A verified rotation projection estimates '+(explicit>=0?'+':'')+fmt(explicit)+' minutes for this player.':
   sport==='nba'||sport==='wnba'||sport==='cbb'?'This could change rotation minutes or usage, but an increase for this player has not been confirmed.':
   sport==='nhl'?'This could change ice time, line deployment or power-play usage; the effect is unconfirmed.':
   'This could affect snaps, carries or targets; a workload increase has not been confirmed.';
  return item.playerName+' ('+item.status+'): '+effect;
 });
 const playerStatus=String(row?.injuryStatus||row?.injury?.status||row?.availabilityEvidence?.text||'');
 if(row?.isOut===true||/^(out|inactive|dnp|injured reserve)$/i.test(playerStatus))notes.unshift('Player availability alert: reported '+(playerStatus||'out')+'. Do not assume this player will participate.');
 if(absence.length)notes.push(...absence);
 else notes.push('Teammate absence impact: no fixture-matched, source-verified absence and role adjustment has been established for this player. An injury elsewhere on the team does not automatically imply more minutes.');
 return notes;
}
