/** Grade only an authenticated pregame selection against an exact final boxscore. */
export function officialFeaturedResult(row:any,payload:any){
 const saved=Date.parse(row.featuredSavedAt||row.boardCapturedAt||row.capturedAt||''),start=Date.parse(row.gameTime||'');
 if(!Number.isFinite(saved)||!Number.isFinite(start)||saved>=start||payload?.success!==true||String(payload.gameId)!==String(row.gameId)||!['post','final','off'].includes(String(payload.state||'').toLowerCase()))return null;
 // A final player boxscore cannot establish who scored the game's first TD.
 // Only settle when an exact, independently verified first-TD scorer ID is supplied.
 if(row.market==='first_td' && (payload.firstTouchdownVerified!==true || !payload.firstTouchdownScorerPlayerId))return null;
 const stat=payload.rows?.find((r:any)=>String(r.playerId)===String(row.playerId))?.stats?.[row.market];
 if(row.market!=='first_td'&&(typeof stat!=='number'||!Number.isFinite(stat)))return null;
 const actual=row.market==='first_td'?(String(payload.firstTouchdownScorerPlayerId)===String(row.playerId)?1:0):stat;
 const side=String(row.prediction||'').toUpperCase(),line=row.sportsbookLine;
 let status:string;
 if(['anytime_td','first_td','first_basket'].includes(row.market)&&['YES','OVER','FIRST BASKET','UNDER','NO'].includes(side))status=(['UNDER','NO'].includes(side)?actual===0:actual>0)?'hit':'miss';
 else if(['YES','FIRST BASKET'].includes(side))status=actual>0?'hit':'miss';
 else {if(!['OVER','UNDER'].includes(side)||typeof line!=='number'||!Number.isFinite(line))return null;status=actual===line?'push':(side==='OVER'?actual>line:actual<line)?'hit':'miss';}
 return {status,actual,verifiedResult:true,resultSource:row.market==='first_td'?'verified_first_touchdown_order':'official_final_boxscore',gradedAt:payload.updatedAt||new Date().toISOString()};
}
