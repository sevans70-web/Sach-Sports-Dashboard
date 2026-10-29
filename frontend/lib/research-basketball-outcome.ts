// Research scoring only: no history writes or sportsbook settlement rules.
export function researchBasketballOutcome(payload:any,gameId:string,gameTime:string,playerId:string,market:string,rows:any[]){
 const c=payload?.header?.competitions?.[0];
 if(String(payload?.header?.id)!==gameId||c?.status?.type?.completed!==true||Date.parse(c.date)!==Date.parse(gameTime))return {status:'pending',reason:'exact_final_unavailable'};
 const athletes=(payload.boxscore?.players??[]).flatMap((t:any)=>(t.statistics??[]).flatMap((s:any)=>s.athletes??[])).filter((a:any)=>String(a.athlete?.id)===playerId);
 const actual=rows.find(r=>r.playerId===playerId)?.stats[market];
 // Conflicting participation evidence must be reviewed, never silently graded.
 if(athletes.some((a:any)=>a.didNotPlay===true))return typeof actual==='number'?{status:'unresolved',reason:'conflicting_participation_evidence'}:{status:'void',reason:'official_did_not_play'};
 if(typeof actual==='number'&&Number.isFinite(actual))return {status:'observed',actual};
 return {status:'unresolved',reason:'final_missing_explicit_player_stat'};
}
