/** Only exclude a pregame candidate. Locked history and confirmed participation
 * remain visible even when an older report says Out. */
export function excludeUnavailablePregame(row:any,now=Date.now()){
 if(row?.boardFrozen||row?.frozen||row?.lockedAtKickoff||['in','post','live','final'].includes(row?.gameState)||Date.parse(row?.gameTime)<=now)return false;
 if(row?.participationConfirmed===true&&String(row.participationGameId||'')===String(row.gameId))return false;
 const context=row?.pregameContext;
 const exact=context&&String(context.gameId)===String(row.gameId)&&String(context.playerId)===String(row.playerId)&&String(context.teamId)===String(row.teamId);
 const reports=exact?context.availability||[]:[];
 const statuses=[...reports.map((r:any)=>r.status),row?.availabilityStatus,row?.injuryStatus,row?.injury_status,row?.playerStatus,row?.injury?.status];
 const evidence=row?.availabilityEvidence;
 if(String(evidence?.gameId||'')===String(row?.gameId)&&['official_injury_status','official_dnp'].includes(evidence?.code))statuses.push(String(evidence.text||'').replace(/^Reported\s+/i,'').split(/\s*[·:]\s*/)[0]);
 return row?.inactive===true||row?.isOut===true||row?.didNotPlay===true||statuses.some(s=>{
  const status=String(s||'').trim().toLowerCase().replace(/[_-]+/g,' ').replace(/\s+/g,' ');
  return /^(out|inactive|suspended|injured reserve|ir|dnp|did not play|scratched|healthy scratch|injured list|il|disabled list|dl|minor leagues|minors|assigned to minors|optioned to minors)$/.test(status)||/^(?:7|10|15|60) day (?:il|injured list|dl|disabled list)$/.test(status);
 });
}

/** A locked board freezes predictions, not injury status. Suppress an officially
 * unavailable nonparticipant from public rankings without rewriting its history.
 * Actual participation in the exact fixture takes precedence over an old report. */
export function excludeUnavailableRanking(row:any,now=Date.now()){
 if(row?.participationConfirmed===true&&String(row.participationGameId||'')===String(row.gameId))return false;
 return excludeUnavailablePregame({...row,boardFrozen:false,frozen:false,lockedAtKickoff:false,
  gameState:'pre',gameTime:new Date(now+60_000).toISOString(),starterConfirmed:false,lineupConfirmed:false},now);
}

export function availablePregameRankings(payload:any,now=Date.now()){
 if(!Array.isArray(payload?.rows)||payload.boardFrozen)return payload;
 const rows=payload.rows.filter((r:any)=>!excludeUnavailablePregame(r,now));
 if(rows.length===payload.rows.length)return payload;
 const locked=rows.some((r:any)=>r.boardFrozen||r.frozen||r.lockedAtKickoff);
 return {...payload,rows:locked?rows:rows.map((r:any,i:number)=>({...r,rank:i+1})),excludedUnavailable:payload.rows.length-rows.length};
}
