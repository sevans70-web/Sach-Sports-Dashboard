import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {gunzipSync} from 'node:zlib';
import {validateNflverseHistory} from '../scripts/nflverse-history-validation.mjs';
import {verifyShadowReceipt,digest} from '../scripts/nhl-shadow-evidence.mjs';import {loadTs} from './load-ts.mjs';
const read=async name=>JSON.parse(gunzipSync(await readFile(new URL('./fixtures/'+name,import.meta.url))));
const data=await read('nflverse-history-2026-11-15.json.gz');
const target={espnGameId:'401873060',season:2026,team:'GB',asOf:'2026-11-15T11:02:00Z'};
const run=(patch={})=>validateNflverseHistory({...data,espnId:'4036378',market:'passing_yards',target,...patch});
test('authorized real nflverse histories match by ESPN/GSIS identity and exact fixture, never by name',()=>{
 const r=run();assert.equal(r.reason,null);assert.equal(r.observations.length,9);assert.equal(r.observations[0].gameId,'2026_01_GB_MIN');assert.equal(r.observations[0].value,387);assert.equal(r.observations[0].playerId,'00-0036264');assert.ok(r.observations.every(o=>o.team==='GB'&&o.espnPlayerId==='4036378'));assert.equal(r.scope,'research_only');assert.equal(r.productionSourceChange,false);
 assert.equal(run({espnId:'unmapped-id'}).reason,'unmapped_player_id');
 const sameName=data.players.map(p=>({...p,name:'Jordan Love'}));assert.deepEqual(run({players:sameName}).observations,r.observations);
 const ambiguous=[...data.players,{gsisId:'other',espnId:'4036378',name:'Jordan Love'}];assert.equal(run({players:ambiguous}).reason,'ambiguous_player_id');
});
test('real prior-season and target-game outcomes cannot enter a pregame NFL history',()=>{
 const r=run();assert.ok(r.excluded.some(x=>x.reason==='previous_season'));assert.ok(r.excluded.some(x=>x.gameId==='2026_10_MIN_GB'&&x.reason==='target_game'));assert.ok(!r.observations.some(x=>x.season===2025||x.gameId==='2026_10_MIN_GB'));
 const early=run({target:{...target,asOf:'2026-10-01T00:00:00Z'}});assert.equal(early.observations.length,3);assert.ok(early.excluded.some(x=>x.reason==='not_pregame'));assert.equal(run({target:{...target,season:2025}}).reason,'target_fixture_mismatch');
});
test('quarter-specific and scoring-order evidence cannot be manufactured from full-game totals',()=>{
 for(const market of ['q1_passing_yards','q1_receiving_yards','q1_rushing_yards']){const r=run({market});assert.equal(r.reason,'quarter_play_by_play_required');assert.deepEqual(r.observations,[]);}
 assert.equal(run({market:'first_td'}).reason,'scoring_order_play_by_play_required');assert.equal(run({market:'tackles_assists'}).reason,'statistic_semantics_not_validated');
});
test('actual zero interceptions and zero rushing yards survive; missing combination components never become zero',()=>{
 const interceptions=run({market:'passing_interceptions'});assert.equal(interceptions.observations.find(o=>o.gameId==='2026_02_GB_NYJ').value,0);
 assert.equal(run({market:'rushing_yards'}).observations[0].value,0);
 const stats=structuredClone(data.stats);stats.find(r=>r.player_id==='00-0036264'&&r.game_id==='2026_01_GB_MIN').rushing_yards='';const combined=run({stats,market:'passing_rushing_yards'});assert.ok(!combined.observations.some(o=>o.gameId==='2026_01_GB_MIN'));assert.ok(combined.excluded.some(o=>o.gameId==='2026_01_GB_MIN'&&o.reason==='missing_stat'));
});
test('duplicate, wrong-team, ambiguous fixture and malformed schedule evidence fail safely without mutating source',()=>{
 const before=structuredClone(data),row=data.stats.find(r=>r.player_id==='00-0036264'&&r.game_id==='2026_01_GB_MIN');
 assert.equal(run({stats:[row,row]}).observations.length,1);const conflicting=run({stats:[row,{...row,passing_yards:'388'}]});assert.equal(conflicting.observations.length,0);assert.ok(conflicting.excluded.every(x=>x.reason==='conflicting_duplicate_game'));assert.equal(run({stats:[{...row,opponent_team:'WRONG'}]}).excluded[0].reason,'team_or_opponent_mismatch');
 assert.equal(run({schedules:[...data.schedules,data.schedules.find(g=>g.espnId==='401873060')]}).reason,'target_fixture_unresolved');
 assert.equal(run({target:{...target,asOf:'invalid'}}).reason,'target_fixture_mismatch');assert.deepEqual(data,before);
});
test('fresh recovered NHL receipt retains original odds and reproduces frozen research probabilities',async()=>{
 const receipt=await read('cw08-recovered-receipt-2026-11-15.json.gz'),before=structuredClone(receipt),body=verifyShadowReceipt(receipt);
 assert.equal(receipt.sha256,'f83272e3e02d06725d1c1f8902a31afdf324fe7ac5b12649c48a73d1e926df67');assert.equal(body.production,false);assert.equal(body.selectionApproved,false);assert.equal(body.modelFreeze.commit,'007c02b');assert.equal(body.historySha256,digest(body.history));
 assert.equal(body.quote.overPrice,145);assert.equal(body.quote.underPrice,-197);assert.equal(body.quote.line,0.5);assert.ok(Date.parse(body.sourceFetchedAt)<Date.parse(body.target.gameTime));assert.ok(Date.parse(body.quote.updatedAt)<=Date.parse(body.sourceFetchedAt));
 const {nhlShadowForecast,priceNhlShadow}=await loadTs(new URL('../lib/nhl-shadow-model.ts',import.meta.url)),forecast=nhlShadowForecast(body.model,body.history,body.target,body.createdAt).forecast;
 assert.ok(forecast);const pricing=priceNhlShadow(forecast,body.quote);for(const [k,v] of Object.entries(body.forecast.pricing)){if(typeof v==='number')assert.ok(Math.abs(pricing[k]-v)<1e-10,k);else assert.deepEqual(pricing[k],v,k);}
 assert.deepEqual(receipt,before);const changed=structuredClone(receipt);changed.quote.overPrice=146;assert.throws(()=>verifyShadowReceipt(changed),/checksum|hash|receipt/i);
});
