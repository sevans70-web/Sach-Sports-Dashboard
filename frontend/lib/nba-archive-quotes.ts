import {createHash} from 'node:crypto';
import {quoteProblem,type ExactQuote} from '@/lib/probability-forecast';
import type {OpportunityGame} from '@/lib/opportunity-backtest';
const markets:Record<string,string>={player_points:'points',player_rebounds:'rebounds',player_assists:'assists',player_threes:'threes_made',player_blocks:'blocks',player_steals:'steals'};
const norm=(v:unknown)=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
/** Standard market fields only. Never guess which of several thresholds is
 * main, substitute a source timestamp, or join a player by name alone. */
export function nbaArchiveQuotes(payload:any,observations:OpportunityGame[],gameId:string,retrievedAt:string){
 if(!Array.isArray(payload?.props)||payload.snapshot_type!=='closing')throw Error('Invalid closing-price response');
 if(payload.has_more===true||payload.truncated===true||payload.count!==payload.props.length)throw Error('Incomplete closing-price response');
 const grouped=new Map<string,ExactQuote[]>(),rejected:Record<string,number>={};
 const reject=(r:string)=>rejected[r]=(rejected[r]||0)+1;
 for(const p of payload.props){
  const market=markets[p.market];if(!market)continue;
  if(String(p.game_id)!==gameId){reject('wrong_fixture');continue}
  const targets=observations.filter(g=>g.sport==='nba'&&g.gameId===gameId&&g.market===market&&g.playerId===String(p.player_id)&&norm(g.playerName)===norm(p.player_name));
  if(targets.length!==1){reject('unmatched_official_identity');continue}
  if(!(targets[0].workload>0)){reject('no_recorded_appearance_settlement_unverified');continue}
  if(p.is_main===false||p.is_alternate===true){reject('alternate_price');continue}
  const line=Number(p.line),overPrice=Number(p.over_odds),underPrice=Number(p.under_odds);
  if([p.line,p.over_odds,p.under_odds].some(v=>v==null||typeof v==='boolean'||String(v).trim()==='')||!Number.isInteger(line*2)){reject('invalid_price_fields');continue}
  const q:ExactQuote&{provenance:Record<string,string>}={sport:'nba',market,period:'game',gameId,playerId:String(p.player_id),bookmaker:String(p.bookmaker||''),
   quoteId:createHash('sha256').update(JSON.stringify([gameId,p.player_id,p.market,p.bookmaker,p.line,p.over_odds,p.under_odds,p.captured_at])).digest('hex'),
   line,overPrice,underPrice,updatedAt:p.captured_at,capturedAt:p.captured_at,decisionAt:p.captured_at,mainLine:true,
   provenance:{source:'https://mcp.dunkapi.com/v1/get_player_props',retrievedAt,collection:'retrospective',
    mainLineEvidence:'documented_standard_player_market',timestampEvidence:'provider_recorded_capture'}};
  const problem=quoteProblem(q,targets[0]);if(problem){reject(problem);continue}
  const key=[q.playerId,market].join('|');grouped.set(key,[...(grouped.get(key)||[]),q]);
 }
 const preference=['pinnacle','fanduel','draftkings','caesars','betmgm'],quotes:ExactQuote[]=[];
 for(const rows of grouped.values()){
  // Stable source preference; neither forecast nor actual selects the price.
  const book=preference.find(b=>rows.some(q=>q.bookmaker===b));if(!book){reject('unsupported_book');continue}
  const chosen=rows.filter(q=>q.bookmaker===book),unique=new Map(chosen.map(q=>[JSON.stringify([q.line,q.overPrice,q.underPrice,q.capturedAt]),q]));
  if(unique.size!==1){reject('ambiguous_book_main_price');continue}
  quotes.push([...unique.values()][0]);
 }
 return {quotes,rejected};
}
