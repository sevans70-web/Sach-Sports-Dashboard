import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {parseSearchPlayers,parseMlbPlayers,matchesPlayer,searchPlayers}=await loadTs(new URL('../lib/player-search.ts',import.meta.url));
const {espnHockeyHistory}=await loadTs(new URL('../lib/search-player-history.ts',import.meta.url));
const entry=(name,league,id,sport='basketball')=>({type:'player',displayName:name,defaultLeagueSlug:league,uid:`s:40~a:${id}`,sport,subtitle:'Team'});
const payload=rows=>({results:[{type:'player',contents:rows}]});
test('directory finds players outside prop boards across all supported leagues and uses stable athlete IDs',()=>{
 const rows=parseSearchPlayers(payload([entry('LeBron James','nba','1966'),entry('LeBron James','nba','1966')]),'LeBron James');
 assert.equal(rows[0].id,'1966');assert.match(rows[0].href,/\/api\/player-search\/open\?/);assert.match(rows[0].href,/id=1966/);
 for(const [league,sport] of [['nfl','nfl'],['college-football','cfb'],['mens-college-basketball','cbb'],['wnba','wnba'],['nhl','nhl']])assert.equal(parseSearchPlayers(payload([entry('A Player',league,'123')]),'Player')[0].sport,sport);
 assert.equal(parseSearchPlayers(payload([entry('Lionel Messi','usa.1','45843','soccer')]),'Messi')[0].league,'usa.1');
 assert.equal(parseSearchPlayers(payload([entry('Josh Hoover','mma','123','mma')]),'Hoover').length,0);
});
test('matching handles accents, apostrophes, hyphens and partial names without creating athletes',()=>{
 for(const [name,q] of [["A'ja Wilson",'Aja Wilson'],['Luka Dončić','luka doncic'],['Shai Gilgeous-Alexander','gilgeous alex'],['LeBron James','james lebron']])assert.equal(matchesPlayer(name,q),true);
 assert.equal(matchesPlayer('LeBron James','LeBron Curry'),false);
});
test('MLB results link using MLBAM IDs and distinguish same-name athletes',()=>{
 const rows=parseMlbPlayers({people:[{id:660271,fullName:'Shohei Ohtani',currentTeam:{name:'Dodgers'},primaryPosition:{abbreviation:'TWP'}},{id:123,fullName:'Other Person'}]},'Ohtani');
 assert.equal(rows.length,1);assert.match(rows[0].href,/\/mlb\/player\/660271\?/);assert.equal(rows[0].position,'TWP');
});
test('empty full-name queries retry surname; failures stay distinct from no matches; duplicates collapse',async()=>{
 const seen=[];const transport=async u=>{seen.push(u);return Response.json(u.includes('statsapi')?{people:[]}:u.includes('query=wilson')?payload([entry("A'ja Wilson",'wnba','3149391'),entry("A'ja Wilson",'wnba','3149391')]):payload([]));};
 const d=await searchPlayers('Aja Wilson',transport);assert.equal(d.players.length,1);assert.equal(d.partial,false);assert(seen.some(u=>u.includes('query=wilson')));
 const partial=await searchPlayers('LeBron',async u=>{if(u.includes('statsapi'))throw Error('offline');return Response.json(payload([entry('LeBron James','nba','1966')]));});assert.equal(partial.partial,true);assert.equal(partial.players.length,1);
 await assert.rejects(searchPlayers('Nobody',async()=>{throw Error('offline')}));
 assert.equal((await searchPlayers('Nobody',async()=>Response.json(payload([])))).players.length,0);
});
test('ESPN hockey identity gets exact dated results, keeping zero and excluding missing stats/preseason/future games',()=>{
 const p={names:['shotsTotal'],events:{a:{gameDate:'2026-10-20',opponent:{displayName:'Opponent'}},b:{gameDate:'2026-10-21'},c:{gameDate:'2026-10-22'},d:{gameDate:'2099-01-01'}},seasonTypes:[{displayName:'Regular Season',categories:[{type:'event',events:[{eventId:'a',stats:['0']},{eventId:'b',stats:['3']},{eventId:'c',stats:['']},{eventId:'d',stats:['99']}]}]},{displayName:'Preseason',categories:[{type:'event',events:[{eventId:'a',stats:['100']}]}]}]};
 const rows=espnHockeyHistory(p,'shots_on_goal',Date.parse('2026-10-24'));assert.deepEqual(rows.map(r=>r.value),[0,3]);assert.equal(rows[0].opponent,'Opponent');assert.deepEqual(espnHockeyHistory(p,'goalie_saves'),[]);
});
