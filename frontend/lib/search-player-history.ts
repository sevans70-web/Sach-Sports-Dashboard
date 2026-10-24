/** NHL search IDs belong to ESPN, not the NHL API's separate identity namespace. */
export function espnHockeyHistory(payload:any,market:string,now=Date.now()){
 const keys:Record<string,string[]>={shots_on_goal:['shotstotal','shots','shotsongoal'],points:['points'],goals:['goals'],assists:['assists'],goalie_saves:['saves'],blocked_shots:['blockedshots']};
 const clean=(v:any)=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const names=(payload?.names||[]).map(clean),index=names.findIndex((n:string)=>(keys[market]||[]).includes(n));if(index<0)return [];
 const out:any[]=[];
 for(const group of payload?.seasonTypes||[]){if(!/regular season/i.test(group.displayName||''))continue;for(const category of group.categories||[]){if(category.type!=='event')continue;for(const game of category.events||[]){
  const meta=payload?.events?.[game.eventId],raw=game.stats?.[index],date=meta?.gameDate||game.gameDate,value=raw==null||String(raw).trim()===''?null:Number(raw);
  if(!game.eventId||!date||!Number.isFinite(Date.parse(date))||Date.parse(date)>=now||value==null||!Number.isFinite(value))continue;
  out.push({gameId:String(game.eventId),date,opponent:String(meta?.opponent?.displayName||meta?.opponent?.abbreviation||''),value});
 }}}return out;
}
