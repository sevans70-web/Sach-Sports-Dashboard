import type {SoccerMarketKey} from "@/lib/soccer";
export type SoccerPick={
 key:string;league:string;market:SoccerMarketKey;gameDate:string;gameId:string;gameTime:string;
 playerId:string;playerName:string;teamName:string;matchup:string;rank:number;
 sportsbookLine:number;modelProjection:number;modelProbability:number|null;pickSide:"OVER"|"UNDER";
 savedAt:string;frozenAt:string|null;status:"pending"|"hit"|"miss"|"push"|"void";
 actual:number|null;gradedAt:string|null;
};
export function soccerDay(value:Date|string=new Date()){
 const d=typeof value==="string"?new Date(value):value;
 if(Number.isNaN(d.getTime()))return "";
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"America/Toronto",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
 const get=(t:string)=>parts.find(p=>p.type===t)?.value||"";
 return `${get("year")}-${get("month")}-${get("day")}`;
}
export function soccerPick(league:string,market:SoccerMarketKey,row:any,now=new Date()):SoccerPick|null{
 const time=String(row.kickoff||row.gameTime||"");
 if(!time||!Number.isFinite(Date.parse(time))||Date.parse(time)<=now.getTime())return null;
 if(!row.gameId||!/^\d+$/.test(String(row.playerId||""))||!(Number(row.games)>0))return null;
 const line=row.marketLine,projection=row.projection;
 if(line==null||projection==null||!Number.isFinite(Number(line))||!Number.isFinite(Number(projection)))return null;
 if(!row.sportsbook||row.marketBacked===false||row.earlyModel)return null;
 const date=soccerDay(time);
 return {key:`${date}|${league}|${market}|${row.gameId}|${row.playerId}`,league,market,gameDate:date,gameId:String(row.gameId),gameTime:time,
 playerId:String(row.playerId),playerName:String(row.playerName||""),teamName:String(row.team||""),matchup:String(row.matchup||""),rank:Number(row.rank)||0,
 sportsbookLine:Number(line),modelProjection:Number(projection),modelProbability:row.modelProbability==null?null:Number(row.modelProbability),pickSide:Number(projection)<Number(line)?"UNDER":"OVER",
 savedAt:now.toISOString(),frozenAt:null,status:"pending",actual:null,gradedAt:null};
}
export function mergeSoccerPicks(existing:SoccerPick[],incoming:SoccerPick[],now=new Date()){
 const map=new Map(existing.map(p=>[p.key,p]));
 for(const next of incoming){
  const old=map.get(next.key);
  if(old&&(old.status!=="pending"||old.frozenAt||Date.parse(old.gameTime)<=now.getTime()))continue;
  if(Date.parse(next.gameTime)<=now.getTime())continue;
  map.set(next.key,next);
 }
 return [...map.values()];
}
export function soccerSettlement(pick:Pick<SoccerPick,"sportsbookLine"|"pickSide">,actual:number|null){
 if(actual==null||!Number.isFinite(actual))return "pending" as const;
 if(actual===pick.sportsbookLine)return "push" as const;
 return (pick.pickSide==="UNDER"?actual<pick.sportsbookLine:actual>pick.sportsbookLine)?"hit" as const:"miss" as const;
}
