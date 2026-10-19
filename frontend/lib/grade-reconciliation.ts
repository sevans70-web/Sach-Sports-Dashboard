import {footballObservedRows} from "@/lib/football-observed-stats";
import {footballQuarterRows} from "@/lib/football-quarter-stats";
import {basketballSummaryActual} from "@/lib/basketball-settlement";
import {nhlObservedActual} from "@/lib/observed-player-stats";

type GradeRow={key:string;status:string;actual?:number|null;gradedAt?:string|null;gameId?:string;playerId?:string;market?:string;pickSide?:string|null;sportsbookLine?:number|null;gradeRevisions?:GradeRevision[]};
type GradeRevision={previousActual:number|null;previousStatus:string;previousGradedAt:string|null;actual:number;status:string;checkedAt:string;gameId:string;playerId:string;source:string};
export function gradeRevisionCount(row:any){return Array.isArray(row?.gradeRevisions)?row.gradeRevisions.length:0}
/** Accept only an extension of the saved audit trail, never a capture overwriting a grade. */
export function correctedGrade<T extends GradeRow>(old:T,next:T):T|null{
 const n=gradeRevisionCount(old),revisions=next.gradeRevisions;
 if(!revisions||revisions.length<=n||JSON.stringify(revisions.slice(0,n))!==JSON.stringify(old.gradeRevisions||[]))return null;
 const first=revisions[n],last=revisions[revisions.length-1];
 if(first.previousActual!==(old.actual??null)||first.previousStatus!==old.status||last.actual!==next.actual||last.status!==next.status)return null;
 return {...old,actual:next.actual,status:next.status,gradedAt:next.gradedAt,gradeRevisions:revisions};
}
/** Full-game corrections require a completed official fixture and exact saved player ID.
 * Quarter/scorer sequence markets need their own complete play-by-play audit. */
export function reconcileOfficialGrade<T extends GradeRow>(row:T,payload:any,sport:string):T{
 if(!["hit","miss","push"].includes(row.status)||!row.gameId||!/^\d+$/.test(String(row.playerId||"")))return row;
 const market=String(row.market||"");
 const footballQuarter=['nfl','cfb'].includes(sport)&&['q1_passing_yards','q1_rushing_yards','q1_receiving_yards'].includes(market);
 if(market.startsWith("q1_")&&!footballQuarter||["first_td","first_basket"].includes(market))return row;
 const competition=payload?.header?.competitions?.[0];
 const id=String(sport==="nhl"?payload?.id:payload?.header?.id||competition?.id||"");
 const final=sport==="nhl"?["FINAL","OFF"].includes(payload?.gameState):competition?.status?.type?.completed===true;
 if(id!==String(row.gameId)||!final)return row;
 let actual:number|null=null;
 if(sport==="nfl"||sport==="cfb")actual=(footballQuarter?footballQuarterRows(payload):footballObservedRows(payload)).find(p=>p.playerId===String(row.playerId))?.stats[market]??null;
 else if(sport==="nhl")actual=nhlObservedActual(payload,String(row.playerId),market);
 else actual=basketballSummaryActual(payload,{playerId:row.playerId},market);
 if(actual==null||!Number.isFinite(actual))return row;
 const side=String(row.pickSide||"").toUpperCase(),line=row.sportsbookLine;
 let status:string;
 if(market==="anytime_td"&&["YES","OVER"].includes(side))status=actual>0?"hit":"miss";
 else if((side==="OVER"||side==="UNDER")&&line!=null&&Number.isFinite(line))status=actual===line?"push":(side==="OVER"?actual>line:actual<line)?"hit":"miss";
 else return row;
 if(actual===row.actual&&status===row.status)return row;
 const checkedAt=new Date().toISOString();
 const revision:GradeRevision={previousActual:row.actual??null,previousStatus:row.status,previousGradedAt:row.gradedAt??null,actual,status,checkedAt,gameId:String(row.gameId),playerId:String(row.playerId),source:footballQuarter?'ESPN Q1 play-by-play reconciled to final boxscore':sport==="nhl"?"NHL final boxscore":"ESPN final boxscore"};
 return {...row,actual,status,gradedAt:checkedAt,gradeRevisions:[...(row.gradeRevisions||[]),revision]};
}
