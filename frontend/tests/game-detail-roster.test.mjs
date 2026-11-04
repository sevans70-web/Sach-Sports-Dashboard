import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {loadTs} from './load-ts.mjs';
const roster=await loadTs(new URL('../lib/game-roster.ts',import.meta.url));
const code=ts.transpileModule(await readFile(new URL('../app/api/game-slate-detail/route.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const competitors=[{homeAway:'home',team:{id:'B',displayName:'Home',abbreviation:'HME'}},{homeAway:'away',team:{id:'A',displayName:'Away',abbreviation:'AWY'}}];
async function request(sport,{box=false,wrongFixture=false,wrongRoster=false}={}){
 const calls=[];
 const summary={header:{id:wrongFixture?'other':'g',competitions:[{competitors}]},boxscore:{players:box?[{team:{id:'B',displayName:'Home',abbreviation:'HME'},statistics:[{athletes:[{athlete:{id:'b',displayName:'Home Player'},starter:true}]}]},{team:{id:'A',displayName:'Away',abbreviation:'AWY'},statistics:[{athletes:[{athlete:{id:'a',displayName:'Away Player'},starter:false,gamesStarted:20}]}]},{team:{id:'OTHER'},statistics:[{athletes:[{athlete:{id:'intruder'}}]}]}]:[]}};
 const mocks={
  '@/lib/player-participation':{espnParticipation:()=>[]},'@/lib/game-roster':roster,
  '@/lib/mlb-server':{},'next/server':{NextResponse:{json:(body,init)=>({body,status:init?.status||200})}},
  '@/lib/provider-fetch':{providerFetch:async url=>{calls.push(url);const id=/teams\/([^/]+)\/roster/.exec(url)?.[1];return {ok:true,json:async()=>id?{team:{id:wrongRoster?'OTHER':id},athletes:[{id:id.toLowerCase(),displayName:id+' Player',starter:true,gamesStarted:20}]}:summary}}}
 };
 const module={exports:{}};vm.runInNewContext(code,{module,exports:module.exports,require:name=>{assert.ok(mocks[name],name);return mocks[name]},console,Date,Map,Set});
 return {response:await module.exports.GET({nextUrl:new URL('https://test/api/game-slate-detail?sport='+sport+'&gameId=g')}),calls};
}
for(const sport of ['nba','nfl','cbb','cfb'])test(sport+' game detail uses official sides, current-game starters, and exact roster teams',async()=>{
 const {response,calls}=await request(sport);assert.equal(response.status,200);assert.equal(response.body.rosters.length,2);
 assert.equal(response.body.rosters.find(r=>r.teamId==='B').side,'home');assert.equal(response.body.rosters.find(r=>r.teamId==='A').side,'away');
 assert.ok(response.body.rosters.every(r=>r.players.every(p=>p.starter===false)));assert.equal(calls.length,3,'one summary and two roster reads, without a second basketball override');
 const {response:final}=await request(sport,{box:true});assert.equal(final.body.rosters.length,2);assert.equal(final.body.rosters.find(r=>r.teamId==='B').players[0].starter,true);assert.equal(final.body.rosters.find(r=>r.teamId==='A').players[0].starter,false);
 const {response:wrong}=await request(sport,{wrongFixture:true});assert.equal(wrong.status,500);assert.equal(wrong.body.rosters.length,0);
 const {response:unrelated}=await request(sport,{wrongRoster:true});assert.equal(unrelated.body.rosters.length,0);
});

test('roster player navigation retains the selected fixture and rejects a same-name different player ID',async()=>{
 const source=ts.createSourceFile('page.tsx',await readFile(new URL('../components/game-slate-page.tsx',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const names=['rosterPlayerHref','researchMarketForPlayer','sameRosterPlayer'];
 const functions=source.statements.filter(node=>ts.isFunctionDeclaration(node)&&names.includes(node.name?.text)).map(node=>node.getText(source)).join('\n');
 const script=ts.transpileModule(functions+'\nexport {rosterPlayerHref,sameRosterPlayer};',{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 const module={exports:{}};vm.runInNewContext(script,{module,exports:module.exports,URLSearchParams,encodeURIComponent,gradeableRankingRow:()=>false,clean:value=>String(value||'').toLowerCase()});
 for(const sport of ['nba','nfl','nhl','cbb','cfb']){
  const url=new URL(module.exports.rosterPlayerHref(sport,{playerId:'p',playerName:'Player',position:'QB'},{teamName:'Away'},{id:'exact-game',date:'2026-11-05T01:00Z',awayTeam:'Away',homeTeam:'Home',state:'pre',status:'Scheduled'}),'https://test');
  assert.equal(url.searchParams.get('gameId'),'exact-game');assert.equal(url.searchParams.get('gameTime'),'2026-11-05T01:00Z');assert.equal(url.searchParams.get('mode'),'profile');
 }
 assert.equal(module.exports.sameRosterPlayer({playerId:'other',playerName:'Same Name'},{playerId:'p',playerName:'Same Name'}),false);
});
