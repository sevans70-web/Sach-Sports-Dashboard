/** Grade only an authenticated pregame selection against an exact final boxscore. */
export function officialFeaturedResult(row:any,payload:any){
 const saved=Date.parse(row.featuredSavedAt||row.boardCapturedAt||row.capturedAt||''),start=Date.parse(row.gameTime||'');
 if(!Number.isFinite(saved)||!Number.isFinite(start)||saved>=start||payload?.success!==true||String(payload.gameId)!==String(row.gameId)||!['post','final','off'].includes(String(payload.state||'').toLowerCase()))return null;
 const stat=payload.rows?.find((r:any)=>String(r.playerId)===String(row.playerId))?.stats?.[row.market];
 if(typeof stat!=='number'||!Number.isFinite(stat))return null;
 const side=String(row.prediction||'').toUpperCase(),line=row.sportsbookLine;
 let status:string;
 if(['YES','FIRST BASKET'].includes(side))status=stat>0?'hit':'miss';
 else {if(!['OVER','UNDER'].includes(side)||typeof line!=='number'||!Number.isFinite(line))return null;status=stat===line?'push':(side==='OVER'?stat>line:stat<line)?'hit':'miss';}
 return {status,actual:stat,verifiedResult:true,resultSource:'official_final_boxscore',gradedAt:payload.updatedAt||new Date().toISOString()};
}
