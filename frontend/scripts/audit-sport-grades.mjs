// Reads a previously captured JSON snapshot and official feeds.
// No replacement prediction, sportsbook line or grade is submitted by this script.
import fs from 'node:fs/promises';
import {loadTs} from '../tests/load-ts.mjs';
const {reconcileOfficialGrade}=await loadTs(new URL('../lib/grade-reconciliation.ts',import.meta.url));
const {basketballSummaryActual}=await loadTs(new URL('../lib/basketball-settlement.ts',import.meta.url));
const {footballObservedRows}=await loadTs(new URL('../lib/football-observed-stats.ts',import.meta.url));
const {footballQuarterRows}=await loadTs(new URL('../lib/football-quarter-stats.ts',import.meta.url));
const {nhlObservedActual}=await loadTs(new URL('../lib/observed-player-stats.ts',import.meta.url));
const origin=process.argv[2]||'https://marvelous-wholeness-production-c8d3.up.railway.app';
const sport=process.argv[3]||'nfl',period=process.argv[4]||'Week';
const output=process.argv[5]||`/tmp/sach-${sport}-grade-audit.json`;
const leagues={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',wnba:'basketball/wnba',cbb:'basketball/mens-college-basketball'};
if(!leagues[sport]&&sport!=='nhl')throw Error('Unknown sport');
const get=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(60000)});if(!r.ok)throw Error(`${r.status} ${url}`);return r.json()};
// Require a captured JSON export: performance routes can also settle records.
// The audit itself only reads that file and official provider endpoints.
const snapshot=process.argv[6];if(!snapshot)throw Error('Read-only JSON snapshot path required as argument 6; no production performance endpoint is called');
const captured=JSON.parse(await fs.readFile(snapshot,'utf8'));
const payloadsByScope=Array.isArray(captured.scopes)?captured.scopes:[{group:'',payload:captured}];
const rows=[],scopes=[];
for(const scope of payloadsByScope){
 const p=scope.payload,records=p.predictions||p.results||[];rows.push(...records);
 scopes.push({group:scope.group,connected:p.connected,records:records.length,displayed:{hits:p.hits,misses:p.misses,settled:p.settled,pending:p.pending,total:p.total},researchSummary:p.researchSummary});
}
const unique=new Map(),duplicates=[];
for(const r of rows){if(!r.key){duplicates.push({problem:'missing_key',player:r.playerName});continue}if(unique.has(r.key))duplicates.push({key:r.key,conflicting:JSON.stringify(unique.get(r.key))!==JSON.stringify(r)});else unique.set(r.key,r)}
const saved=[...unique.values()].filter(r=>['hit','miss','push'].includes(r.historicalStatus||r.status)&&!r.withdrawnFromBoard);
const payloads=new Map(),findings=[],unverified=[],verified=[];
for(const r of saved){
 const footballQuarter=['nfl','cfb'].includes(sport)&&['q1_passing_yards','q1_rushing_yards','q1_receiving_yards'].includes(r.market);
 if(!r.gameId||String(r.market).startsWith('q1_')&&!footballQuarter||['first_td','first_basket'].includes(r.market)){unverified.push({key:r.key,reason:'missing_fixture_or_sequence_market'});continue}
 const url=sport==='nhl'?`https://api-web.nhle.com/v1/gamecenter/${r.gameId}/boxscore`:`https://site.api.espn.com/apis/site/v2/sports/${leagues[sport]}/summary?event=${r.gameId}`;
 try{
  if(!payloads.has(r.gameId))payloads.set(r.gameId,await get(url));
  const p=payloads.get(r.gameId),competition=p?.header?.competitions?.[0];
  const id=String(sport==='nhl'?p?.id:p?.header?.id||competition?.id||'');
  const final=sport==='nhl'?['FINAL','OFF'].includes(p?.gameState):competition?.status?.type?.completed===true;
  if(id!==String(r.gameId)||!final){unverified.push({key:r.key,reason:'official_fixture_not_final_or_wrong_id'});continue}
  const original={...r,status:r.historicalStatus||r.status,pickSide:r.archivedOriginal?.prediction||r.pickSide,sportsbookLine:r.archivedOriginal?.sportsbookLine??r.sportsbookLine};
  const actual=['nfl','cfb'].includes(sport)?(footballQuarter?footballQuarterRows(p):footballObservedRows(p)).find(x=>x.playerId===String(r.playerId))?.stats[r.market]??null:sport==='nhl'?nhlObservedActual(p,String(r.playerId),r.market):basketballSummaryActual(p,{playerId:r.playerId},r.market);
  if(actual==null||!Number.isFinite(actual)){unverified.push({key:r.key,reason:'official_player_stat_unavailable',source:url});continue}
  if(!(['OVER','UNDER'].includes(original.pickSide)&&Number.isFinite(original.sportsbookLine)||r.market==='anytime_td'&&['YES','OVER'].includes(original.pickSide))){unverified.push({key:r.key,reason:'original_selection_or_line_missing'});continue}
  const corrected=reconcileOfficialGrade(original,p,sport);
  if(corrected!==original)findings.push({key:r.key,player:r.playerName,market:r.market,gameId:r.gameId,side:original.pickSide,line:original.sportsbookLine,savedActual:r.actual,officialActual:corrected.actual,savedStatus:original.status,officialStatus:corrected.status,source:url});
  else verified.push(r.key);
 }catch(e){unverified.push({key:r.key,reason:'source_request_failed',error:e.message})}
}
const timestampIssues=[...unique.values()].filter(r=>Number.isFinite(Date.parse(r.savedAt))&&Number.isFinite(Date.parse(r.gameTime))&&Date.parse(r.savedAt)>=Date.parse(r.gameTime)).map(r=>({key:r.key,savedAt:r.savedAt,gameTime:r.gameTime}));
const report={at:new Date().toISOString(),sport,period,records:rows.length,uniqueRecords:unique.size,scopes,duplicates,settledRecords:saved.length,verifiedGradeRecords:verified.length,unverifiedGradeRecords:unverified.length,fixturesFetched:payloads.size,findings,unverified,timestampIssues,
 scope:'Official-stat and saved-selection arithmetic audit only. Historical sportsbook provenance, original forecast calibration, DNP/void rules, hidden archived files and first-scorer sequences require separate evidence. Empty/missing/unverifiable records are never counted as passed.'};
await fs.writeFile(output,JSON.stringify(report,null,2));console.log(JSON.stringify({...report,unverified:report.unverified.length,scopes:undefined}));
