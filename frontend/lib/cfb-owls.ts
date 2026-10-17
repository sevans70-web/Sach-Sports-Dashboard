import {getOwlsPayload} from "@/lib/owls-provider";
import {footballBookRows, type FootballBookRow} from "@/lib/football-book-quotes";
import {type CfbMarketKey, cleanName} from "@/lib/cfb";

const MARKET_ALIASES:Record<CfbMarketKey,string[]>={
  passing_yards:["passing_yards","passingyards","pass_yards","passyards","player_pass_yds"],
  pass_completions:["passing_completions","pass_completions","completions","passingcompletions","player_pass_completions"],
  rushing_yards:["rushing_yards","rushingyards","rush_yards","rushyards","player_rush_yds"],
  receiving_yards:["receiving_yards","receivingyards","reception_yards","receptionyards","player_reception_yds"],
  receptions:["receptions","receiving_receptions","receivingreceptions","player_receptions"],
  anytime_td:["anytime_td","anytime_touchdown","anytime_touchdown_scorer","touchdown_scorer","touchdowns","player_anytime_td"],
  first_td:["first_td","first_td_scorer","firstTouchdownScorer","first_touchdown","first_touchdown_scorer","first_scorer","player_1st_td"],
};


export type CfbOwlsRow=FootballBookRow;

async function sharedPayload(){return getOwlsPayload("ncaaf")}
export async function getOwlsCfbRows(market:CfbMarketKey):Promise<CfbOwlsRow[]>{
  return footballBookRows(await sharedPayload(),market,MARKET_ALIASES[market]);
}

export async function getOwlsQualifiedGames(markets:CfbMarketKey[]){
  const all=await Promise.all(markets.map(async market=>{try{return [market,await getOwlsCfbRows(market)] as const}catch{return [market,[]] as const}}));
  const out=new Map<string,{matchup:string;gameTime:string;eventId:string;props:CfbMarketKey[]}>();
  for(const [market,rows] of all)for(const row of rows){
    if(!row.matchup)continue;const k=cleanName(row.matchup);
    const cur=out.get(k)||{matchup:row.matchup,gameTime:row.gameTime,eventId:row.eventId,props:[]};
    if(!cur.gameTime&&row.gameTime)cur.gameTime=row.gameTime;if(!cur.eventId&&row.eventId)cur.eventId=row.eventId;if(!cur.props.includes(market))cur.props.push(market);out.set(k,cur);
  }
  return [...out.values()];
}
