const clean=(v:unknown)=>String(v??"").toLowerCase().replace(/[^a-z0-9]/g,"");
function day(value:unknown){
 const s=String(value??"");if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
 const d=new Date(s);if(!s||Number.isNaN(d.getTime()))return "";
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 return ["year","month","day"].map(key=>parts.find(p=>p.type===key)?.value).join("-");
}
export function matchingPredictionResult(payload:any,row:any){
 const source=[...(Array.isArray(payload?.predictions)?payload.predictions:[]),...(Array.isArray(payload?.results)?payload.results:[])];
 const id=String(row?.playerId??row?.player_id??row?.batter_id??""),name=clean(row?.playerName??row?.player_name??row?.player);
 const game=String(row?.gameId??row?.gamePk??row?.game_pk??""),matchup=clean(row?.matchup);
 const date=day(row?.gameDate??row?.gameTime??row?.kickoff??row?.date),market=clean(row?.market??row?.marketKey);
 const candidates=source.filter((p:any)=>{
  const otherGame=String(p?.gameId??p?.gamePk??p?.game_pk??"");
  const otherMarket=clean(p?.market??p?.marketKey);if(market&&otherMarket&&market!==otherMarket)return false;
  if(game&&otherGame)return game===otherGame;
  const otherMatchup=clean(p?.matchup);if(matchup&&otherMatchup&&matchup!==otherMatchup)return false;
  const otherDate=day(p?.gameDate??p?.gameTime??p?.kickoff??p?.date);if(date&&otherDate&&date!==otherDate)return false;
  return true;
 });
 return candidates.find((p:any)=>id&&id===String(p?.playerId??p?.player_id??p?.batter_id??""))||candidates.find((p:any)=>name&&name===clean(p?.playerName??p?.player_name??p?.player))||null;
}
