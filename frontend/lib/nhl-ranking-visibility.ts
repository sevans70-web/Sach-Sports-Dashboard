import {completeRankingProp} from '@/lib/public-card-metrics';
import {verifiedPropQuote} from '@/lib/prop-integrity';
import {excludeUnavailableRanking} from '@/lib/ranking-availability';
import {uniqueQuoteFixture} from '@/lib/main-market-quotes';
import type {NhlGame,NhlPlayer} from '@/lib/nhl';

export function matchNhlQuotePlayer(quote:any,players:NhlPlayer[],games:NhlGame[],market:string){
 const matched=players.filter(player=>market!=='goalie_saves'||player.position==='G')
  .flatMap(player=>{const game=uniqueQuoteFixture(quote,games,player.team,15*60_000);return game?[{player,game}]:[];});
 return new Set(matched.map(({player,game})=>player.playerId+'|'+game.gameId)).size===1?matched[0]:null;
}

export function nhlQuoteContextMarket(market:string){
 return ['shots_on_goal','points','assists','goalie_saves'].includes(market);
}

export function nhlRankingVisible(row:any,now=Date.now()){
 if(excludeUnavailableRanking(row,now))return false;
 if(!nhlQuoteContextMarket(row?.market))return completeRankingProp(row,now)!=null;
 if(row.sport!=='nhl'||!row.quoteId||row.quoteVerified!==true||row.lineType!=='main'||
    row.withdrawnFromBoard||row.resultStatus==='void'||row.archivedOriginal?.resultStatus==='void'||
    (row.quoteMarket&&row.quoteMarket!==row.market)||(row.quotePeriod&&row.quotePeriod!=='game'))return false;
 return verifiedPropQuote(row,now,row.boardFrozen===true);
}
