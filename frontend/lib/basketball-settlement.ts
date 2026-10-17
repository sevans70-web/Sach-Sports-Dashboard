import {statNumber} from "@/lib/provider-fetch";
import {dashboardDay} from "@/lib/dashboard-contract";
const norm=(x:any)=>String(x??"").toLowerCase().replace(/[^a-z0-9]/g,"");
const aliases:Record<string,string[]>={points:["pts","points"],rebounds:["reb","rebs","rebounds"],assists:["ast","assists"],threes_made:["3pm","3ptm","threepointfieldgoalsmade","threepointersmade","3pt"],steals:["stl","steals"],blocks:["blk","blocks"]};
const combined:Record<string,string[]>={pts_rebs_asts:["points","rebounds","assists"],pts_rebs:["points","rebounds"],pts_asts:["points","assists"],rebs_asts:["rebounds","assists"]};
export function basketballValue(value:any,market:string,label=""){
 if(market==="threes_made"&&/^(3pt|3p|3pma)$/i.test(label)){
  const match=String(value??"").match(/^(\d+)\s*[-/]\s*\d+$/);if(match)return Number(match[1]);
 }
 return statNumber(value);
}
export function basketballSummaryActual(payload:any,p:{playerId?:string|number;playerName?:string},market:string):number|null{
 if(combined[market]){const values=combined[market].map(m=>basketballSummaryActual(payload,p,m));return values.some(v=>v==null)?null:values.reduce<number>((n,v)=>n+(v??0),0)}
 if(!aliases[market])return null;
 for(const team of payload?.boxscore?.players||[])for(const group of team.statistics||[]){
  const labels=(group.labels||group.keys||[]).map((x:any)=>norm(typeof x==="string"?x:x.name||x.displayName||x.abbreviation||x.label));
  const ix=aliases[market].map(a=>labels.indexOf(a)).find(i=>i>=0);if(ix==null)continue;
  for(const row of group.athletes||[]){
   const athlete=row.athlete||row.player||{},id=String(athlete.id||row.athleteId||row.playerId||""),wanted=String(p.playerId||"");
   const matches=wanted&&id?wanted===id:norm(p.playerName)===norm(athlete.displayName||athlete.fullName||athlete.name);
   if(!matches||row.didNotPlay===true)continue;
   return basketballValue((row.stats||row.values||[])[ix],market,labels[ix]);
  }
 }
 return null;
}
export function basketballLogActual(payload:any,p:{gameId?:string},market:string,day:string):number|null{
 if(combined[market]){const values=combined[market].map(m=>basketballLogActual(payload,p,m,day));return values.some(v=>v==null)?null:values.reduce<number>((n,v)=>n+(v??0),0)}
 if(!aliases[market])return null;
 const labels=(payload?.names||[]).map(norm),ix=aliases[market].map(a=>labels.indexOf(a)).find(i=>i>=0);if(ix==null)return null;
 for(const season of payload?.seasonTypes||[])for(const category of season.categories||[])if(category.type==="event")for(const event of category.events||[]){
  const eventId=String(event.eventId||""),meta=payload.events?.[eventId]||{},date=meta.gameDate||event.gameDate||"";
  // ID is authoritative. A missing date must never select an unrelated game.
  if(p.gameId?eventId!==String(p.gameId):!date||dashboardDay(date)!==day)continue;
  return basketballValue((event.stats||[])[ix],market,labels[ix]);
 }
 return null;
}
