/** Completed game observations only. No projections, averages or undated series. */
export function playerGameObservations(sport:string,id:string,market:string,points:any[]){
 return points.filter(p=>p.gameId&&Number.isFinite(Date.parse(p.date))&&p.value!=null&&typeof p.value!=='boolean'&&String(p.value).trim()!==''&&Number.isFinite(Number(p.value))).map(p=>({sport,player_id:id,game_id:String(p.gameId),market,game_time:new Date(p.date).toISOString(),actual:Number(p.value),point:p,source:p.source||'official_game_log',observed_at:new Date().toISOString()}));
}
