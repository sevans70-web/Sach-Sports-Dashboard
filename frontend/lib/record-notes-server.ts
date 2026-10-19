import {providerFetch} from '@/lib/provider-fetch';
import {officialRecordAvailability} from '@/lib/record-notes';
const leagues:Record<string,string>={nfl:'football/nfl',cfb:'football/college-football',nba:'basketball/nba',wnba:'basketball/wnba',cbb:'basketball/mens-college-basketball'};
/** Explain evidence without rewriting historical statuses or alleging a cause. */
export async function enrichRecordAvailability(rows:any[],sport:string){
 const games=[...new Set(rows.map(r=>String(r.gameId||'')).filter(id=>/^\d+$/.test(id)))];
 const evidence=new Map<string,any>();let index=0;
 await Promise.all(Array.from({length:Math.min(6,games.length)},async()=>{
  while(index<games.length){const gameId=games[index++];
   try{
    const url=sport==='nhl'?`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`:`https://site.api.espn.com/apis/site/v2/sports/${leagues[sport]}/summary?event=${gameId}`;
    const response=await providerFetch(url);if(!response.ok)continue;
    evidence.set(gameId,await response.json());
   }catch{/* Saved reasons remain visible when the provider is unavailable. */}
  }
 }));
 return rows.map(row=>{const note=officialRecordAvailability(row,evidence.get(String(row.gameId)),sport);return note?{...row,availabilityEvidence:note}:row});
}
