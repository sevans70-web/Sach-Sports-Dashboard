/** Research-only source validation. No network, predictions, storage or runtime imports. */
const columns={passing_yards:['passing_yards'],passing_tds:['passing_tds'],passing_interceptions:['passing_interceptions'],qb_rushing_yards:['rushing_yards'],rushing_yards:['rushing_yards'],receiving_yards:['receiving_yards'],receptions:['receptions'],passing_rushing_yards:['passing_yards','rushing_yards'],rushing_receiving_yards:['rushing_yards','receiving_yards']};
const numeric=value=>value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?Number(value):null;
export function validateNflverseHistory({players,stats,schedules,espnId,market,target}){
 const result={scope:'research_only',productionSourceChange:false,reason:null,observations:[],excluded:[]};
 const stop=reason=>({...result,reason});
 if(market.startsWith('q1_'))return stop('quarter_play_by_play_required');
 if(market==='first_td')return stop('scoring_order_play_by_play_required');
 const fields=columns[market];if(!fields)return stop('statistic_semantics_not_validated');
 const matches=players.filter(p=>String(p.espnId)===String(espnId)&&p.gsisId);
 if(matches.length!==1)return stop(matches.length?'ambiguous_player_id':'unmapped_player_id');
 const fixtures=schedules.filter(g=>String(g.espnId)===String(target.espnGameId));
 if(fixtures.length!==1)return stop('target_fixture_unresolved');
 const fixture=fixtures[0],kickoff=Date.parse(fixture.gameTime),asOf=Date.parse(target.asOf);
 if(fixture.season!==target.season||!['REG','POST'].includes(fixture.gameType)||![fixture.homeTeam,fixture.awayTeam].includes(target.team)||!Number.isFinite(kickoff)||!Number.isFinite(asOf))return stop('target_fixture_mismatch');
 const cutoff=Math.min(kickoff,asOf),seen=new Set(),byGame=new Map(),signatures=new Map(),conflicts=new Set();
 for(const row of stats.filter(r=>r.player_id===matches[0].gsisId)){const signature=JSON.stringify([row.season,row.season_type,row.team,row.opponent_team,...fields.map(k=>row[k]),row.attempts]);if(signatures.has(row.game_id)&&signatures.get(row.game_id)!==signature)conflicts.add(row.game_id);else signatures.set(row.game_id,signature);}
 for(const g of schedules){const all=byGame.get(g.gameId)||[];all.push(g);byGame.set(g.gameId,all);}
 for(const row of stats){
  if(row.player_id!==matches[0].gsisId)continue;
  const games=byGame.get(row.game_id)||[],game=games.length===1?games[0]:null,time=game?Date.parse(game.gameTime):NaN;
  const parts=fields.map(k=>numeric(row[k]));
  const reason=conflicts.has(row.game_id)?'conflicting_duplicate_game':Number(row.season)!==target.season?'previous_season':!['REG','POST'].includes(row.season_type)?'not_regular_or_postseason':!game?'history_fixture_unresolved':game.season!==target.season||game.gameType!==row.season_type?'history_fixture_mismatch':row.game_id===fixture.gameId?'target_game':!Number.isFinite(time)||time>=cutoff?'not_pregame':row.team!==target.team||![game.homeTeam,game.awayTeam].includes(row.team)||row.opponent_team!==(game.homeTeam===row.team?game.awayTeam:game.homeTeam)?'team_or_opponent_mismatch':seen.has(row.game_id)?'duplicate_game':parts.some(v=>v===null)?'missing_stat':null;
  if(reason){result.excluded.push({gameId:row.game_id,reason});continue;}
  seen.add(row.game_id);result.observations.push({gameId:row.game_id,espnGameId:String(game.espnId),playerId:matches[0].gsisId,espnPlayerId:String(espnId),season:target.season,team:row.team,opponent:row.opponent_team,date:game.gameTime,value:parts.reduce((a,b)=>a+b,0),workload:numeric(row.attempts)});
 }
 result.observations.sort((a,b)=>a.date.localeCompare(b.date));
 return result;
}
