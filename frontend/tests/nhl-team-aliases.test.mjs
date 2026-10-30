import test from 'node:test';import assert from 'node:assert/strict';import {loadTs}from './load-ts.mjs';
const {nhlTeamAliases}=await loadTs(new URL('../lib/nhl-team-aliases.ts',import.meta.url));
const {uniqueQuoteFixture}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const row=(abbr,full,common,seasonId=20262027)=>({seasonId,teamAbbrev:{default:abbr},teamName:{default:full},teamCommonName:{default:common}});
const source={standings:[row('NJD','New Jersey Devils','Devils'),row('VGK','Vegas Golden Knights','Golden Knights')]};
const aliases=nhlTeamAliases(source,'20262027');
const game={gameId:'2026020214',awayTeam:'Devils',awayAbbr:'NJD',homeTeam:'Golden Knights',homeAbbr:'VGK',tipoff:'2026-10-30T22:00Z',awayTeamAliases:aliases.get('NJD'),homeTeamAliases:aliases.get('VGK')};
const quote={matchup:'New Jersey Devils @ Vegas Golden Knights',gameTime:game.tipoff};
test('official full names, common names and abbreviations resolve the same unique NHL fixture',()=>{
 for(const matchup of [quote.matchup,'Devils @ Golden Knights','NJD @ VGK'])assert.equal(uniqueQuoteFixture({...quote,matchup},[game],'NJD'),game);
 assert.equal(uniqueQuoteFixture(quote,[{...game,awayTeamAliases:undefined,homeTeamAliases:undefined}],'NJD'),null);
});
test('aliases cannot rescue wrong opponent, reversed teams, wrong time or duplicate fixtures',()=>{
 for(const q of [{...quote,matchup:'New Jersey Devils @ Los Angeles Kings'},{...quote,matchup:'Vegas Golden Knights @ New Jersey Devils'},{...quote,gameTime:'2026-10-31T22:00Z'}])assert.equal(uniqueQuoteFixture(q,[game],'NJD'),null);
 assert.equal(uniqueQuoteFixture(quote,[game,{...game,gameId:'other'}],'NJD'),null);
 assert.equal(uniqueQuoteFixture(quote,[{...game,homeTeamAliases:['New Jersey Devils']}],'NJD'),null);
});
test('different-season, incomplete or conflicting official identities do not become aliases',()=>{
 assert.equal(nhlTeamAliases(source,'20252026').size,0);
 assert.equal(nhlTeamAliases({standings:[...source.standings,row('NJD','Other Devils','Devils')]},'20262027').has('NJD'),false);
 assert.equal(nhlTeamAliases({standings:[{seasonId:20262027,teamAbbrev:'NJD'}]},'20262027').size,0);
});
test('accented official Montréal identity matches the unaccented book spelling',()=>{
 const g={...game,awayTeam:'Canadiens',awayAbbr:'MTL',awayTeamAliases:nhlTeamAliases({standings:[row('MTL','Montréal Canadiens','Canadiens')]},'20262027').get('MTL')};
 assert.equal(uniqueQuoteFixture({...quote,matchup:'Montreal Canadiens @ Vegas Golden Knights'},[g],'MTL'),g);
});
