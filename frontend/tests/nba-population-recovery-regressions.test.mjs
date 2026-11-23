import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{gunzipSync}from'node:zlib';import{loadTs}from'./load-ts.mjs';
const{nbaRosterNameKeys}=await loadTs(new URL('../lib/nba-fixture-identity.ts',import.meta.url)),{nbaQuoteMatchesGame,nbaQuoteMatchesRosterTeam}=await loadTs(new URL('../lib/nba-game-match.ts',import.meta.url));
test('newly observed current NBA suffix variants require the exact verified official ID and canonical name',()=>{
 for(const[id,name,alias]of[['4432848','Jaime Jaquez Jr.','Jaime Jaquez'],['5142620','Darius Acuff Jr.','Darius Acuff'],['4397688','Trey Murphy III','Trey Murphy'],['5101761','Mikel Brown Jr.','Mikel Brown'],['4432639','Jabari Smith Jr.','Jabari Smith'],['3936099','Derrick Jones Jr.','Derrick Jones']]){
  const key=s=>s.toLowerCase().replace(/[^a-z0-9]/g,'');assert.ok(nbaRosterNameKeys({playerId:id,playerName:name}).includes(key(alias)));assert.ok(!nbaRosterNameKeys({playerId:'other',playerName:name}).includes(key(alias)));assert.ok(!nbaRosterNameKeys({playerId:id,playerName:'Unrelated Player'}).includes(key(alias)));
 }
});
test('official LAC name/abbreviation allow its full city spelling without aliasing Lakers, another fixture or date',()=>{
 const g={gameId:'401910043',awayTeam:'LA Clippers',awayAbbr:'LAC',homeTeam:'Houston Rockets',homeAbbr:'HOU',tipoff:'2026-11-24T01:30Z'},q={matchup:'Los Angeles Clippers @ Houston Rockets',gameTime:'2026-11-24T01:40Z'};
 assert.equal(nbaQuoteMatchesGame(q,g),true);for(const changed of [{awayAbbr:'LAL'},{awayTeam:'Los Angeles Lakers',awayAbbr:'LAL'},{homeTeam:'New Orleans Pelicans'},{tipoff:'2026-11-25T01:30Z'}])assert.equal(nbaQuoteMatchesGame(q,{...g,...changed}),false);assert.equal(nbaQuoteMatchesGame({...q,matchup:'Houston Rockets @ Los Angeles Clippers'},g),false);
 assert.equal(nbaQuoteMatchesRosterTeam({playerTeam:'Los Angeles Clippers'},{teamAbbr:'LAC',teamName:'LA Clippers'}),true);
 assert.equal(nbaQuoteMatchesRosterTeam({playerTeam:'Los Angeles Clippers'},{teamAbbr:'LAL',teamName:'LA Clippers'}),false);
 assert.equal(nbaQuoteMatchesRosterTeam({playerTeam:'Los Angeles Lakers'},{teamAbbr:'LAC',teamName:'LA Clippers'}),false);
});
test('the source operation ceiling remains256 across cache misses and HTTP; incomplete evidence stays explicitly unavailable',async()=>{
 const pack=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/nba-population-sources-2026-11-23.json.gz',import.meta.url)))),{refreshNbaObservations}=await loadTs(new URL('../lib/live-basketball-observations.ts',import.meta.url));let reads=0,http=0;
 const result=await refreshNbaObservations(pack.rows,pack.clock,async()=>{http++;throw Object.assign(Error('recorded athlete-log403 contract; no live network'),{status:403});},{evidence:{read:()=>{reads++;return null;}}});
 assert.equal(result.sourceBudget.limit,256);assert.equal(result.sourceBudget.attempted,256);assert.equal(result.sourceBudget.exhausted,true);assert.equal(reads+http,256);assert.ok(result.unavailablePlayers.length>0);assert.equal(result.observations.length,0);
});
