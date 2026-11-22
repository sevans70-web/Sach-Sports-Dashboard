import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadTs} from './load-ts.mjs';
const {nbaRosterNameKeys,dedupeNbaFixtureQuotes}=await loadTs(new URL('../lib/nba-fixture-identity.ts',import.meta.url));
const {nbaQuoteMatchesGame,nbaQuoteMatchesRosterTeam}=await loadTs(new URL('../lib/nba-game-match.ts',import.meta.url));
const {mainMarketQuotes}=await loadTs(new URL('../lib/main-market-quotes.ts',import.meta.url));
const norm=s=>String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');

test('verified NBA aliases require both the official ID and canonical name; unrelated identities stay unchanged',()=>{
 for(const [id,official,alias] of [['4871145','Josh Giddey','Joshua Giddey'],['5160992','Alex Sarr','Alexandre Sarr'],['3138196','Cameron Johnson','Cam Johnson']]){
  assert.deepEqual(nbaRosterNameKeys({playerId:id,playerName:official}),[norm(official),norm(alias)]);
  assert.deepEqual(nbaRosterNameKeys({playerId:'other',playerName:official}),[norm(official)]);
  assert.deepEqual(nbaRosterNameKeys({playerId:id,playerName:'Unrelated Player'}),['unrelatedplayer']);
 }
});

test('reused Nov22 seven-market source evidence recovers exact roster identities without changing quotes or fixture guards',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'nba-alias-evidence-'));const clock=Date.now;Date.now=()=>Date.parse('2026-11-22T17:48:00Z');
 try{
  execFileSync('tar',['-xzf',resolve('../docs/audits/2026-11-22-nba-diagnostic-live/evidence.tar.gz'),'-C',dir]);
  const json=async name=>JSON.parse(await readFile(join(dir,name),'utf8'));
  const games=(await json('official-nba-slate.json')).games.filter(g=>Date.parse(g.date)>=Date.parse('2026-11-22T05:00Z')&&Date.parse(g.date)<Date.parse('2026-11-23T05:00Z'));
  assert.equal(games.length,7);
  const entries=[];for(const g of games)for(const roster of (await json(`official-rosters-${g.id}.json`)).rosters)for(const player of roster.players)if(player.active!==false)entries.push({game:{...g,gameId:g.id,tipoff:g.date},roster,player});
  assert.equal(entries.length,246);
  const select=(quote,aliases)=>{const found=entries.filter(e=>(aliases?nbaRosterNameKeys(e.player):[norm(e.player.playerName)]).includes(norm(quote.playerName))&&nbaQuoteMatchesGame(quote,e.game));return found.length===1?found[0]:undefined;};
  let beforeMissing=0,afterMissing=0;const result=[];
  for(const market of ['points','rebounds','assists','threes_made','pts_rebs_asts','pts_rebs','pts_asts']){
   const sample=await json(`odds-${market}.json`),unchanged=JSON.stringify(sample),joined=[];
   for(const game of sample.games)for(const book of game.books)for(const prop of book.props){
    const q={...prop,gameTime:game.commenceTime,matchup:`${game.awayTeam} @ ${game.homeTeam}`};
    if(!select(q,false))beforeMissing++;if(!select(q,true))afterMissing++;
   }
   const board=mainMarketQuotes({data:sample.games},market,p=>p.category===market);
   const recovered=[];
   for(const quote of board){const e=select(quote,true);if(!e)continue;if(!select(quote,false))recovered.push(e.player.playerId);assert.ok(nbaQuoteMatchesRosterTeam(quote,e.roster));joined.push({quote,gameId:e.game.gameId,playerId:e.player.playerId,playerName:e.player.playerName});
    assert.equal(select({...quote,gameTime:'2026-11-25T00:00:00Z'},true),undefined);
    assert.equal(select({...quote,matchup:'Unrelated Team @ Another Team'},true),undefined);
    assert.equal(nbaQuoteMatchesRosterTeam({...quote,playerTeam:'UNRELATED'},e.roster),false);
   }
   const deduped=dedupeNbaFixtureQuotes(joined);assert.equal(new Set(joined.map(r=>`${r.gameId}|${r.playerId}`)).size,deduped.length);
   for(const q of deduped)assert.ok(board.includes(q),'quote ID, line, price, source period and original timestamp remain the same object');
   assert.equal(JSON.stringify(sample),unchanged);assert.ok(recovered.length>0);result.push({market,executableQuotes:board.length,recoveredOfficialPlayerIds:[...new Set(recovered)],deduped:deduped.length});
  }
  assert.equal(beforeMissing,46);assert.equal(afterMissing,0);
  console.log('NBA_ALIAS_COVERAGE',JSON.stringify({rosterSlots:entries.length,beforeUnmatchedOfferOccurrences:beforeMissing,afterUnmatchedOfferOccurrences:afterMissing,markets:result,productionAccess:false,projectionsChanged:false}));
 }finally{Date.now=clock;await rm(dir,{recursive:true,force:true});}
});
