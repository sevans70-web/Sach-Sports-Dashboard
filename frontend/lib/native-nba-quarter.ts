import {nbaQuoteMatchesGame} from '@/lib/nba-game-match';
const clean=(v:any)=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const price=(r:any)=>{const p=r?.winRunnerOdds?.americanDisplayOdds?.americanOdds;return typeof p==='number'&&Number.isFinite(p)&&Math.abs(p)>=100?p:null};
/** Translate FanDuel's original quarter contracts. Milestones keep their N+
 * threshold and one-sided price; they are never relabelled main over/unders. */
export function nativeNbaQuarterRows(payload:any,readAt:number,overview:any,market:string,now=Date.now()){
 if(!['q1_points','q1_rebounds','q1_assists','q1_threes_made'].includes(market))return [];
 const age=payload?.meta?.ageSeconds;
 if(typeof age!=='number'||!Number.isFinite(age)||age<0||!Number.isFinite(readAt))return [];
 const stamp=readAt-age*1000;if(now-stamp>15*60000||stamp>now+60000)return [];
 const events=new Map<string,any>(),markets:any[]=[],stack=[{v:payload?.data,d:0}];let count=0;
 while(stack.length&&count++<100000){const {v,d}=stack.pop()!;if(!v||typeof v!=='object'||d>16)continue;
  if(v.eventId&&v.openDate&&v.name&&!v.marketType)events.set(String(v.eventId),v);
  // A market is a leaf for discovery. Its runner/price tree is read below;
  // descending through it here exhausted the scan budget before later games.
  if(typeof v.marketType==='string'){if(v.marketStatus==='OPEN')markets.push(v);continue;}
  for(const x of Object.values(v))if(x&&typeof x==='object')stack.push({v:x,d:d+1});
 }
 const rows:any[]=[];
 for(const m of markets){
  const main=market==='q1_points'&&/^PLAYER_[A-Z]+_1ST_QUARTER_POINTS$/.test(m.marketType)&&m.bettingType==='MOVING_HANDICAP';
  const target=m.bettingType==='ODDS'?String(m.marketType).match(/^1ST_QUARTER_-_TO_(?:SCORE|RECORD)_(\d+)\+_(POINTS|REBOUNDS|ASSISTS|MADE_THREES)$/):null;
  const targetMarkets:Record<string,string>={POINTS:'q1_points',REBOUNDS:'q1_rebounds',ASSISTS:'q1_assists',MADE_THREES:'q1_threes_made'};
  if(!main&&(!target||targetMarkets[target[2]]!==market))continue;
  const event=events.get(String(m.eventId));if(!event||!m.marketId)continue;
  const games=(overview.games||[]).filter((g:any)=>Date.parse(g.tipoff)>now&&nbaQuoteMatchesGame({matchup:event.name,gameTime:event.openDate},g));
  if(games.length!==1)continue;const game=games[0];
  const active=(m.runners||[]).filter((r:any)=>r.runnerStatus==='ACTIVE'&&price(r)!=null);
  const offers:any[]=[];
  if(main){
   // Require exactly one pair, same named player and exact same threshold.
   if((m.runners||[]).length!==2||active.length!==2)continue;
   const over=active.find((r:any)=>/\sOver$/i.test(r.runnerName)),under=active.find((r:any)=>/\sUnder$/i.test(r.runnerName));
   if(!over||!under||clean(over.runnerName.replace(/\sOver$/i,''))!==clean(under.runnerName.replace(/\sUnder$/i,'')))continue;
   if(typeof over.handicap!=='number'||!Number.isFinite(over.handicap)||over.handicap<0||!Number.isInteger(over.handicap*2)||over.handicap!==under.handicap)continue;
   offers.push({name:over.runnerName.replace(/\sOver$/i,''),line:over.handicap,over,under});
  }else for(const runner of active)if(Number(target![1])>0)offers.push({name:runner.runnerName,line:Number(target![1]),over:runner,under:null});
  for(const o of offers){
   const players=(overview.players||[]).filter((p:any)=>clean(p.playerName)===clean(o.name)&&[game.awayAbbr,game.homeAbbr].includes(p.team));
   if(players.length!==1)continue;const p=players[0];
   const over=price(o.over)!,under=o.under?price(o.under):null;
   rows.push({rank:0,playerId:String(p.playerId),playerName:p.playerName,teamId:p.teamId||'',teamName:p.team,position:p.position||'',headshot:p.headshot||'',teamLogo:p.teamLogo||'',market,
    gameId:String(game.gameId),gameTime:game.tipoff,providerGameTime:event.openDate,providerEventId:String(event.eventId),matchup:event.name,gameState:'pre',gameStatus:game.status||'Scheduled',
    sportsbook:'FanDuel',sportsbookKey:'fanduel',quoteVersion:1,lineType:main?'main':'milestone',sportsbookLine:o.line,overPrice:over,underPrice:under,
    quoteId:`fanduel:${m.marketId}:${o.over.selectionId||clean(o.name)}:${o.line}`,quoteUpdatedAt:new Date(stamp).toISOString(),capturedAt:new Date(now).toISOString(),
    quoteUrl:'https://sportsbook.fanduel.com/',quoteMarket:market,quotePeriod:'q1',sourceCategory:m.marketType,sourcePeriod:'1q',bookmakerCount:1,marketBacked:true,
    modelProjection:null,modelProbability:null,giScore:null,perGame:null,summary:main?'First-quarter sportsbook line.':'First-quarter sportsbook milestone.'});
  }
 }
 // Stable contract preference: main pair first, otherwise lowest offered N+.
 rows.sort((a,b)=>(a.lineType==='main'?0:1)-(b.lineType==='main'?0:1)||a.sportsbookLine-b.sportsbookLine||a.quoteId.localeCompare(b.quoteId));
 const seen=new Set<string>();return rows.filter(r=>{const key=r.gameId+'|'+r.playerId;if(seen.has(key))return false;seen.add(key);return true}).map((r,i)=>({...r,rank:i+1}));
}
