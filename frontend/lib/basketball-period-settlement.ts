const clean=(v:any)=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function orderedPlays(payload:any){return [...(payload?.plays||[])].sort((a,b)=>Number(a.sequenceNumber??0)-Number(b.sequenceNumber??0))}
function namePattern(name:string){return clean(name).replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}
function subject(text:string,name:string){return Boolean(name)&&new RegExp(`^${namePattern(name)} (?:makes|misses|offensive rebound|defensive rebound|enters|blocks|steals|lost|bad|personal|shooting|foul)\\b`).test(clean(text))}
export function basketballQuarterComplete(payload:any){
 const competition=payload?.header?.competitions?.[0],status=competition?.status||payload?.header?.status||{};
 return Number(status.period)>1||status.type?.completed===true;
}
/** Missing/truncated play-by-play stays pending; full-game box scores are forbidden. */
export function basketballQ1Actual(payload:any,p:{playerId?:string;playerName?:string},market:string):number|null{
 if(!basketballQuarterComplete(payload))return null;
 const plays=orderedPlays(payload).filter(x=>Number(x.period?.number??x.period)===1);
 const competitors=payload?.header?.competitions?.[0]?.competitors||[];
 const scores=competitors.map((c:any)=>{
  const quarter=(c.linescores||[]).find((s:any,i:number)=>Number(s.period?.number??s.period??i+1)===1);
  const raw=quarter?.value??quarter?.displayValue;
  return raw==null||typeof raw==='boolean'||String(raw).trim()===''?NaN:Number(raw);
 });
 const scored=plays.reduce((n,x)=>n+(x.scoringPlay===true?Number(x.scoreValue)||0:0),0);
 if(scores.length!==2||scores.some((x:number)=>!Number.isFinite(x))||scores.reduce((a:number,b:number)=>a+b,0)!==scored||!plays.length)return null;
 const athletes=(payload?.boxscore?.players||[]).flatMap((team:any)=>(team.statistics||[]).flatMap((group:any)=>group.athletes||[]));
 const exact=p.playerId?athletes.find((a:any)=>String(a.athlete?.id)===String(p.playerId)):null;
 if(p.playerId&&athletes.length&&(!exact||exact.didNotPlay===true))return null;
 const name=String(exact?.athlete?.displayName||exact?.athlete?.fullName||p.playerName||"");if(!name)return null;
 const identities=new Set(athletes.filter((a:any)=>clean(a.athlete?.displayName||a.athlete?.fullName)===clean(name)).map((a:any)=>String(a.athlete?.id)));
 if(identities.size>1)return null; // Text-only play attribution cannot disambiguate names.
 const starter=Boolean(p.playerId&&(payload?.boxscore?.players||[]).some((team:any)=>(team.statistics||[]).some((group:any)=>(group.athletes||[]).some((a:any)=>String(a.athlete?.id)===String(p.playerId)&&a.starter===true&&a.didNotPlay!==true))));
 let points=0,rebounds=0,assists=0,threes=0,participated=starter;
 for(const play of plays){
  const text=String(play.text||play.shortText||""),n=clean(text),own=subject(text,name);
  if(own)participated=true;
  if(own&&/ makes /.test(n)&&play.scoringPlay===true){points+=Number(play.scoreValue)||0;if(Number(play.scoreValue)===3)threes++}
  if(own&&/^(?:.+) (?:offensive|defensive) rebound$/.test(n))rebounds++;
  if(new RegExp(`\\b${namePattern(name)} assists\\b`).test(n)){assists++;participated=true}
 }
 if(!participated)return null;
 const values:Record<string,number>={q1_points:points,q1_rebounds:rebounds,q1_assists:assists,q1_threes_made:threes,q1_pts_rebs_asts:points+rebounds+assists};
 return values[market]??null;
}
/** First score includes free throws. First-field-goal markets are deliberately not aliases. */
export function basketballFirstBasketActual(payload:any,p:{playerId?:string;playerName?:string}){
 const plays=orderedPlays(payload),first=plays.find(x=>x.scoringPlay===true&&Number(x.scoreValue)>0);
 if(!first||Number(first.period?.number??first.period)!==1)return null;
 // A truncated feed cannot establish the first score.
 if(Number(first.homeScore||0)+Number(first.awayScore||0)!==Number(first.scoreValue))return null;
 const text=String(first.text||first.shortText||"");
 if(!p.playerName||!/ makes /i.test(text))return null;
 return subject(text,p.playerName)?1:0;
}
