import test from 'node:test';import assert from 'node:assert/strict';import {loadTs}from './load-ts.mjs';
const {uniqueQuoteFixture}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const game={gameId:'401920982',awayAbbr:'ND',homeAbbr:'VILL',awayTeam:'Notre Dame Fighting Irish',homeTeam:'Villanova Wildcats',awayTeamAliases:['Notre Dame','ND'],homeTeamAliases:['Villanova','VILL'],neutralSite:true,tipoff:'2026-11-01T14:30Z'};
const quote={matchup:'Villanova @ Notre Dame',gameTime:'2026-11-01T14:30:33Z'};
test('official neutral venue permits provider side reversal with both exact school identities and time',()=>{
 assert.equal(uniqueQuoteFixture(quote,[game],'ND'),game);
 assert.equal(uniqueQuoteFixture({...quote,matchup:'Notre Dame @ Villanova'},[game],'ND'),game);
 assert.equal(uniqueQuoteFixture({...quote,matchup:'Villanova @ Notre Dame Fighting Irish'},[game],'ND'),game);
});
test('unknown/nonneutral venues, wrong schools/dates and ambiguous neutral fixtures remain excluded',()=>{
 for(const neutralSite of [false,undefined,'true'])assert.equal(uniqueQuoteFixture(quote,[{...game,neutralSite}],'ND'),null);
 for(const q of [{...quote,matchup:'Villanova @ Miami'},{...quote,gameTime:'2026-11-02T14:30:33Z'}])assert.equal(uniqueQuoteFixture(q,[game],'ND'),null);
 assert.equal(uniqueQuoteFixture(quote,[game,{...game,gameId:'different'}],'ND'),null);
});
test('official scoreboard loader preserves neutral flag and school aliases for quote matching',async()=>{
 const {loadCbbGames}=await loadTs(new URL('../lib/cbb.ts',import.meta.url));const original=globalThis.fetch;
 globalThis.fetch=async()=>new Response(JSON.stringify({events:[{id:game.gameId,date:game.tipoff,season:{year:2027},status:{type:{state:'pre'}},competitions:[{neutralSite:true,competitors:[{homeAway:'away',team:{id:'87',displayName:game.awayTeam,shortDisplayName:'Notre Dame',abbreviation:'ND'}},{homeAway:'home',team:{id:'222',displayName:game.homeTeam,shortDisplayName:'Villanova',abbreviation:'VILL'}}]}]}]}));
 try{const games=await loadCbbGames();assert.equal(games.length,1);assert.equal(games[0].neutralSite,true);assert.equal(uniqueQuoteFixture(quote,games,'ND'),games[0]);}finally{globalThis.fetch=original}
});
test('book school tags are removed from name matching, retained as evidence and checked against the current team',async()=>{
 const {cbbQuotePlayerName,cbbQuoteTeam}=await loadTs(new URL('../lib/cbb-fixture-identity.ts',import.meta.url));
 assert.deepEqual(cbbQuotePlayerName('Braeden Shrewsberry (ND)'),{name:'Braeden Shrewsberry',teamTag:'ND'});
 assert.deepEqual(cbbQuotePlayerName('Devin Royal (VILL)'),{name:'Devin Royal',teamTag:'VILL'});
 assert.deepEqual(cbbQuotePlayerName('Tyler Perkins'),{name:'Tyler Perkins',teamTag:null});
 assert.equal(cbbQuoteTeam({providerTeamTag:'ND'},{team:'ND'}),'ND');
 assert.equal(cbbQuoteTeam({providerTeamTag:'ND'},{team:'VILL'}),'');
 assert.equal(cbbQuoteTeam({providerTeamTag:'ND'},undefined),'');
 assert.equal(cbbQuoteTeam({providerTeamTag:null},{team:'VILL'}),'VILL');
});
