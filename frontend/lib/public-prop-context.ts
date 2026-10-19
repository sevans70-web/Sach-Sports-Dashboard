const num=(v:any)=>v==null||typeof v==='boolean'||String(v).trim()===''?null:Number.isFinite(Number(v))?Number(v):null;
const fmt=(v:number)=>Number(v.toFixed(1)).toString();
/** Descriptive pregame history only; never a forecast, edge, or GI score. */
export function datedCardHistory(points:any[],kickoff:string,market:string,sport:string){
 const cutoff=Date.parse(kickoff);if(!Number.isFinite(cutoff))return [];
 return points.filter(p=>Number.isFinite(Date.parse(p.date))&&Date.parse(p.date)<cutoff&&num(p.value)!=null)
  .filter(p=>!market.startsWith('q1_')||p.period==='q1')
  .filter(p=>!['nfl','cfb'].includes(sport)||p.season==null||Number(p.season)===new Date(cutoff).getUTCFullYear())
  .filter(p=>!['nfl','cfb'].includes(sport)||!['passing_yards','passing_tds'].includes(market)||num(p.workload)!=null&&Number(p.workload)>=10)
  .sort((a,b)=>Date.parse(a.date)-Date.parse(b.date)).slice(-20).map(p=>Number(p.value));
}
export function publicPropContext(row:any,sport:string,market:string,history:number[]=[]){
 const cutoff=Date.parse(row.gameTime||'');
 const cohort=(row.researchCohort?.observations||[]).filter((p:any)=>p.included===true&&num(p.value)!=null&&Date.parse(p.date)<cutoff).sort((a:any,b:any)=>Date.parse(a.date)-Date.parse(b.date));
 const values=(cohort.length?cohort.map((p:any)=>Number(p.value)):history).filter(Number.isFinite).slice(-5);
 const count=values.length,average=count?values.reduce((a:number,b:number)=>a+b,0)/count:null;
 const line=row.quoteVerified===true?num(row.sportsbookLine):null,facts:string[]=[];
 const unit=market.includes('yards')?'yards':market.includes('points')?'points':market.includes('rebounds')?'rebounds':market.includes('assists')?'assists':market==='shots_on_goal'?'shots on goal':market==='goalie_saves'?'saves':market==='receptions'?'receptions':'per game';
 if(count){
  facts.push(`Last ${count}: ${values.map(fmt).join(', ')} ${unit}.`);
  if(line!=null&&!/anytime|first/.test(market))facts.push(`${values.filter((v:number)=>v>line).length} of the last ${count} finished above ${fmt(line)}; ${values.filter((v:number)=>v<line).length} below${values.some((v:number)=>v===line)?`, ${values.filter((v:number)=>v===line).length} on the line`:''}.`);
  if(count>=5){const recent=(values.at(-1)!+values.at(-2)!)/2,earlier=values.slice(0,-2).reduce((a:number,b:number)=>a+b,0)/(count-2);facts.push(`Latest two average ${fmt(recent)} ${unit}, versus ${fmt(earlier)} in the preceding ${count-2}.`)}
  const workload=cohort.slice(-5).map((p:any)=>num(p.workload));
  if(/passing/.test(market)&&workload.length&&workload.every((v:any)=>v!=null))facts.push(`Passing workload: ${fmt(workload.reduce((a:number,b:number)=>a+b!,0)/workload.length)} attempts per game in this sample.`);
 }
 if(row.availabilityEvidence?.text&&String(row.availabilityEvidence.gameId)===String(row.gameId))facts.push(row.availabilityEvidence.text);
 const actual=num(row.gameState==='post'?row.actualResult:row.liveCurrent);
 if(['in','post'].includes(row.gameState)&&actual!=null)facts.unshift(`${row.gameState==='post'?'Finished with':'Currently at'} ${fmt(actual)} ${unit}${line!=null?`; ${fmt(Math.abs(actual-line))} ${actual>=line?'above':'below'} the ${fmt(line)} line`:''}.`);
 if(!facts.length)facts.push(row.historyLoaded===true?'Recent results are unavailable for this market.':'Loading recent player results…');
 return {facts,face:facts.slice(0,2).join(' '),recentAverage:average,recentCount:count,recentLabel:count?`Last ${count} avg.`:'Recent avg.'};
}
