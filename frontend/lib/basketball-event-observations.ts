import {basketballQ1Actual,basketballFirstBasketActual} from '@/lib/basketball-period-settlement';
/** Official event labels only. These are training observations, never a pick,
 * probability, sportsbook line, or historical pregame feature snapshot. */
export function basketballEventObservations(p:any,expectedGameId:string,retrievedAt:string){
 const h=p?.header,c=h?.competitions?.[0],start=Date.parse(c?.date||''),at=Date.parse(retrievedAt);
 if(String(h?.id)!==expectedGameId||h?.season?.type!==2||c?.status?.type?.completed!==true||!Number.isFinite(start)||!Number.isFinite(at)||start>=at-48*3600000)return null;
 const players=(p.boxscore?.players||[]).flatMap((t:any)=>(t.statistics||[]).flatMap((g:any)=>(g.athletes||[]).filter((a:any)=>a.didNotPlay!==true).map((a:any)=>({playerId:String(a.athlete?.id||''),playerName:String(a.athlete?.displayName||''),teamId:String(t.team?.id||''),starter:a.starter===true}))));
 if(!players.length||players.some((a:any)=>!a.playerId||!a.playerName||!a.teamId)||new Set(players.map((a:any)=>a.playerId)).size!==players.length||new Set(players.map((a:any)=>a.playerName.toLowerCase())).size!==players.length)return null;
 const rows=players.map((a:any)=>({...a,points:basketballQ1Actual(p,a,'q1_points'),rebounds:basketballQ1Actual(p,a,'q1_rebounds'),assists:basketballQ1Actual(p,a,'q1_assists'),threes:basketballQ1Actual(p,a,'q1_threes_made'),firstScore:basketballFirstBasketActual(p,a)}));
 // Missing tape/name coverage cannot produce a partial training label set.
 const expected=(c.competitors||[]).map((t:any)=>({teamId:String(t.team?.id||''),points:Number(t.linescores?.[0]?.value??t.linescores?.[0]?.displayValue)}));
 const q1Complete=expected.length===2&&expected.every((t:any)=>Number.isFinite(t.points)&&rows.filter((a:any)=>a.teamId===t.teamId).reduce((n:number,a:any)=>n+(a.points??0),0)===t.points);
 const firstComplete=rows.every((a:any)=>a.firstScore===0||a.firstScore===1)&&rows.filter((a:any)=>a.firstScore===1).length===1;
 return {gameId:expectedGameId,gameTime:new Date(start).toISOString(),season:String(h.season.year),retrievedAt,q1Complete,firstComplete,players:rows.map((a:any)=>({...a,...(!q1Complete?{points:null,rebounds:null,assists:null,threes:null}:{}),...(!firstComplete?{firstScore:null}:{})}))};
}
