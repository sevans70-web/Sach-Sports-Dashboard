import {nbaQuoteMatchesGame} from '@/lib/nba-game-match';
const clean=(v:any)=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
/** Translate only an open whole-game first-basket scorer market with fresh prices. */
export function nativeFirstBasketRows(payload:any,readAt:number,overview:any,now=Date.now()){
 const age=payload?.meta?.ageSeconds;if(typeof age!=='number'||age<0||!Number.isFinite(age))return [];
 const stamp=readAt-age*1000;if(now-stamp>15*60000||stamp>now+60000)return [];
 const events=new Map(),markets:any[]=[],stack=[{v:payload?.data,d:0}];let count=0;
 while(stack.length&&count++<100000){const {v,d}=stack.pop()!;if(!v||typeof v!=='object'||d>16)continue;
 if(v.eventId&&v.openDate&&v.name&&!v.marketType)events.set(String(v.eventId),v);
 if(v.marketType==='FIRST_BASKET_(SAME_GAME_MULTIS)'&&v.marketStatus==='OPEN'&&v.bettingType==='ODDS')markets.push(v);
 for(const x of Object.values(v))if(x&&typeof x==='object')stack.push({v:x,d:d+1});}
 const out:any[]=[];
 for(const m of markets){const event=events.get(String(m.eventId));if(!event)continue;
 const matches=(overview.games||[]).filter((g:any)=>Date.parse(g.tipoff)>now&&nbaQuoteMatchesGame({matchup:event.name,gameTime:event.openDate},g));if(matches.length!==1)continue;const game=matches[0];
 for(const runner of m.runners||[]){const price=runner.winRunnerOdds?.americanDisplayOdds?.americanOdds;if(runner.runnerStatus!=='ACTIVE'||typeof price!=='number'||!Number.isFinite(price)||Math.abs(price)<100)continue;
 const players=(overview.players||[]).filter((p:any)=>clean(p.playerName)===clean(runner.runnerName)&&[game.awayAbbr,game.homeAbbr].includes(p.team));if(players.length!==1)continue;const player=players[0];
 out.push({playerId:String(player.playerId),playerName:player.playerName,teamName:player.team,market:'first_basket',gameId:String(game.gameId),gameTime:game.tipoff,gameState:'pre',matchup:event.name,sportsbook:'FanDuel',sportsbookKey:'fanduel',quoteVersion:1,lineType:'scorer',sportsbookLine:null,overPrice:price,underPrice:null,quoteId:`fanduel:${m.marketId}:${runner.selectionId||clean(runner.runnerName)}`,quoteUpdatedAt:new Date(stamp).toISOString(),capturedAt:new Date(now).toISOString(),quoteUrl:'https://sportsbook.fanduel.com/',marketBacked:true});
 }}return out;
}
