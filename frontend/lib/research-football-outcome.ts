// Research scoring only. Exact official identity, time and participation are
// required; this does not settle bets or write dashboard history.
export function researchFootballOutcome(payload:any,target:{gameId:string;gameTime:string;playerId:string;market:string;teamId:string;opponentId:string},rows:any[]){
 const c=payload?.header?.competitions?.[0],teams=(c?.competitors??[]).map((v:any)=>String(v.team?.id));
 if(String(payload?.header?.id)!==target.gameId||c?.status?.type?.completed!==true||!Number.isFinite(Date.parse(target.gameTime))||Date.parse(c.date)!==Date.parse(target.gameTime)||!target.teamId||!target.opponentId||target.teamId===target.opponentId||teams.length!==2||!teams.includes(target.teamId)||!teams.includes(target.opponentId))return {status:'pending',reason:'exact_official_final_unavailable'};
 const athletes=(payload.boxscore?.players??[]).flatMap((t:any)=>(t.statistics??[]).flatMap((s:any)=>s.athletes??[])).filter((a:any)=>String(a.athlete?.id)===target.playerId);
 const actual=rows.find(r=>r.playerId===target.playerId)?.stats[target.market];
 if(athletes.some((a:any)=>a.didNotPlay===true))return typeof actual==='number'?{status:'unresolved',reason:'conflicting_participation_evidence'}:{status:'void',reason:'official_did_not_play'};
 if(typeof actual==='number'&&Number.isFinite(actual))return {status:'observed',actual};
 return {status:'unresolved',reason:'final_missing_explicit_player_stat'};
}
