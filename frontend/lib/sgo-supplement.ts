import {providerFetch} from "@/lib/provider-fetch";
const cache=new Map<string,{at:number;data:any}>(),pending=new Map<string,Promise<any>>();
/** Uses the same configured credentials as NFL/CFB, without extra setup. */
export async function getSgoSupplement(leagueID:string){
 const key=process.env.SPORTSGAMEODDS_API_KEY||process.env.SPORTS_GAME_ODDS_API_KEY||process.env.SPORTSGAMEODDS_KEY;
 if(!key)return {data:[],warning:"Supplemental odds provider is not configured."};
 const hit=cache.get(leagueID);if(hit&&Date.now()-hit.at<60_000)return hit.data;
 const running=pending.get(leagueID);if(running)return running;
 const work=(async()=>{try{
  const qs=new URLSearchParams({leagueID,oddsAvailable:"true",finalized:"false",startsAfter:new Date().toISOString(),startsBefore:new Date(Date.now()+10*86400000).toISOString(),limit:"100"});
  const response=await providerFetch(`https://api.sportsgameodds.com/v2/events?${qs}`,{headers:{"x-api-key":key,Accept:"application/json"},cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!response.ok)throw new Error(`Supplemental odds returned ${response.status}`);
  const data=await response.json();cache.set(leagueID,{at:Date.now(),data});return data;
 }catch(e){const data={data:[],warning:e instanceof Error?e.message:String(e)};cache.set(leagueID,{at:Date.now(),data});return data}})();
 pending.set(leagueID,work);try{return await work}finally{pending.delete(leagueID)}
}
export function sgoPlayerName(event:any,odd:any){
 const id=String(odd.playerID||odd.statEntityID||""),p=event.players?.[id];
 return String(odd.statEntityName||odd.playerName||odd.statEntity?.name||p?.name||p?.displayName||[p?.firstName,p?.lastName].filter(Boolean).join(" ")||"");
}
export function sgoNbaGames(payload:any){
 return (payload?.data||[]).map((event:any)=>({
  awayTeam:event.teams?.away?.names?.long||event.teams?.away?.name||event.awayTeamName||"",
  homeTeam:event.teams?.home?.names?.long||event.teams?.home?.name||event.homeTeamName||"",
  commenceTime:event.status?.startsAt||event.startsAt||"",
  books:[{key:"SGO consensus",props:Object.entries(event.odds||{}).flatMap(([id,value]:any)=>{
   const odd={oddID:id,...value},side=String(odd.sideID||"").toLowerCase();
   if(side&&!['over','yes'].includes(side))return [];
   return [{...odd,playerName:sgoPlayerName(event,odd),category:odd.statID,line:odd.bookOverUnder??odd.overUnder,overPrice:odd.bookOdds??odd.odds}];
  })}]
 }));
}
