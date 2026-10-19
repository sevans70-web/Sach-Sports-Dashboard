import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {footballBookRows,footballQuoteFields,footballQuoteGame}=await loadTs(new URL('../lib/football-book-quotes.ts',import.meta.url));
const now=Date.parse('2026-10-17T23:10:00Z');
const quote=(more={})=>({playerName:'Drew Mestemaker',category:'passing_yards',line:289.5,overPrice:104,underPrice:-131,lastUpdate:'2026-10-17T23:09:00Z',...more});
const book=(key,props)=>({key,title:key,lastUpdate:'2026-10-17T23:09:00Z',props});
const game=(books,more={})=>({gameId:'okst-hou',awayTeam:'Oklahoma State Cowboys',homeTeam:'Houston Cougars',commenceTime:'2026-10-17T23:30:00Z',books,...more});
const rows=(books,market='passing_yards',more={})=>footballBookRows({data:[game(books,more)]},market,[market],now);
test('quote fixture must match official teams and kickoff, never a feed-update timestamp',()=>{
 const row=rows([book('pinnacle',[quote()])])[0],scheduled={id:'a',awayTeam:'Oklahoma State Cowboys',homeTeam:'Houston Cougars',date:'2026-10-17T23:30:00Z'};
 assert.equal(footballQuoteGame(row,[scheduled]).id,'a');
 assert.equal(footballQuoteGame({...row,gameTime:'2026-10-17T23:18:00Z'},[scheduled]),undefined);
 assert.equal(footballQuoteGame({...row,matchup:'Oklahoma State Cowboys @ Another Team'},[scheduled]),undefined);
 assert.equal(footballQuoteGame({...row,gameTime:'2026-10-24T23:30:00Z'},[scheduled]),undefined);
});

test('Drew regression: reject DraftKings 170 milestone and retain real two-sided 289.5 with exact prices',()=>{
 const result=rows([book('draftkings',[quote({playerName:'Drew Mestemaker (OKST)',line:170,overPrice:-2900,underPrice:null,marketStructure:'milestone'})]),book('pinnacle',[quote()]),book('fanduel',[quote({overPrice:-112,underPrice:-112})])]);
 assert.equal(result.length,1);assert.equal(result[0].line,289.5);assert.equal(result[0].sportsbookKey,'pinnacle');assert.equal(result[0].overPrice,104);assert.equal(result[0].underPrice,-131);assert.equal(result[0].bookmakerCount,2);assert.equal(result[0].lineType,'main');assert.equal(result[0].quoteVersion,1);
 assert.equal(result[0].prob,46.4);
});
test('never invent the median of two different book thresholds or mix their prices',()=>{
 const [r]=rows([book('pinnacle',[quote({line:289.5})]),book('caesars',[quote({line:286.5,overPrice:-125,underPrice:-108})])]);
 assert.equal(r.line,289.5);assert.equal(r.price,104);assert.equal(r.bookmakerCount,1);
});
test('nested alternates are never walked; explicit alternate and milestone props are excluded',()=>{
 const main=quote({alternateLines:[{line:170,odds:-2900,category:'passing_yards',playerName:'Drew Mestemaker'}]});
 assert.equal(rows([book('fanduel',[main])])[0].line,289.5);
 for(const extra of [{marketStructure:'milestone'},{marketStructure:'alternate'},{isAlternate:true},{isMainLine:false},{propId:'fanduel-alt-drew-passing_yards'}])assert.equal(rows([book('fanduel',[quote(extra)])]).length,0);
});
test('both sides and valid prices are required for standard O/U; no fabricated generic-book provenance',()=>{
 for(const extra of [{underPrice:null},{underPrice:''},{underPrice:0},{underPrice:1.91},{overPrice:null},{line:null},{line:''}])assert.equal(rows([book('pinnacle',[quote(extra)])]).length,0);
 assert.equal(rows([book('',[quote()])]).length,0);
});
test('freshness, suspension, date and category validation fail closed',()=>{
 for(const extra of [{lastUpdate:'2026-10-17T22:00:00Z'},{lastUpdate:'2026-10-18T00:00:00Z'},{lastUpdate:'invalid'},{suspended:true},{isSuspended:true},{active:false},{category:'receiving_yards'}])assert.equal(rows([book('pinnacle',[quote(extra)])]).length,0);
 assert.equal(rows([book('pinnacle',[quote()])],'passing_yards',{commenceTime:''}).length,0);
});
test('NFL and Q1 use the same validation without treating a legitimate low main line as an error',()=>{
 const q=quote({category:'q1_passing_yards',line:49.5,overPrice:-110,underPrice:-110});
 assert.equal(rows([book('pinnacle',[q])],'q1_passing_yards')[0].line,49.5);
 assert.equal(rows([book('pinnacle',[quote({periodID:'1q'})])]).length,0);
 assert.equal(rows([book('pinnacle',[{...q,periodID:'game'}])],'q1_passing_yards').length,0);
 assert.equal(rows([book('pinnacle',[quote({line:170,overPrice:-110,underPrice:-110})])])[0].line,170);
});
test('scorer markets stay available with a one-sided YES price',()=>{
 const [r]=rows([book('fanduel',[quote({category:'first_td',line:null,underPrice:null,overPrice:1200})])],'first_td');
 assert.equal(r.lineType,'scorer');assert.equal(r.price,1200);assert.equal(r.underPrice,null);
});
test('same player in another game/day is never collapsed into one quote',()=>{
 const g=game([book('pinnacle',[quote()])]);
 const r=footballBookRows({data:[g,{...g,commenceTime:'2026-10-24T23:30:00Z',books:[book('pinnacle',[quote({line:250.5})])]}]},'passing_yards',['passing_yards'],now);
 assert.equal(r.length,2);assert.deepEqual(r.map(x=>x.line),[289.5,250.5]);
 assert.equal(footballQuoteFields(r[0]).overPrice,104);
});
test('provider rush_rec_yards alias qualifies only as the same full-game combined market',()=>{
 const [r]=rows([book('draftkings',[quote({category:'rush_rec_yards',line:75.5})])],'rushing_receiving_yards');assert.equal(r.line,75.5);
 assert.equal(rows([book('draftkings',[quote({category:'rush_rec_yards',periodID:'1q'})])],'rushing_receiving_yards').length,0);
});
test('observed BetMGM Q1 milestone feed is never relabeled as a two-way main O/U',()=>{
 for(const [base,line,price]of [['passing_yards',40,-325],['receiving_yards',5,-295],['rushing_yards',5,-700]]){
 const result=footballBookRows({data:[game([book('betmgm',[quote({category:base+'_1q',line,overPrice:price,underPrice:undefined,marketStructure:'milestone'})])])]},'q1_'+base,[base+'_1q'],now);assert.equal(result.length,0);
 }
});
