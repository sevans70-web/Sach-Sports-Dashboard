import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {mlbAdminSnapshot}=await loadTs(new URL('../lib/hidden-admin-history.ts',import.meta.url));
const {ADMIN_SPORTS,adminResult}=await loadTs(new URL('../lib/admin-policy.ts',import.meta.url));
const {VISIBLE_SPORTS}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
test('hidden sports remain available only in admin navigation',()=>{
 for(const sport of ['mlb','soccer']){assert.ok(ADMIN_SPORTS.includes(sport));assert.ok(!VISIBLE_SPORTS.includes(sport));}
});
test('legacy MLB target-hit labels do not manufacture sportsbook grades or saved sides',()=>{
 const source={batter:{captured_at:'2026-10-01T18:00Z',categories:{hits:[{player_id:1,name:'Player',game_pk:2,correct:true,actual:1,result_label:'Hit'}]}}};
 const original=JSON.stringify(source),rows=mlbAdminSnapshot(source,'2026-10-01');
 assert.equal(rows.length,1);assert.equal(rows[0].status,'unknown');assert.equal(rows[0].legacyResult,'Hit');
 const result=adminResult(rows[0]);assert.equal(result.status,'unknown');assert.equal(result.side,null);assert.equal(result.line,null);assert.equal(JSON.stringify(source),original);
});
test('original saved projections and score values remain accessible without marking them validated',()=>{
 const r=adminResult({modelProjection:10,archivedOriginal:{modelProjection:12.5,modelProbability:60,giScore:75}});
 assert.equal(r.modelProjection,12.5);assert.equal(r.modelProbability,60);assert.equal(r.giScore,75);assert.equal(r.verifiedPick,false);
});

test('MLB inspector preserves first-seen timestamps and legacy projections without inventing verified probabilities',()=>{
 const source={batter:{captured_at:'2026-10-24T03:00Z',categories:{home_runs:[{player_id:1,player_name:'P',team_name:'Team',opponent_name:'Opponent',first_seen_at:'2026-10-24T01:00Z',projection:.25,gi_score:100,home_run_probability:29.6,result_label:'Hit'}]}}};
 const row=mlbAdminSnapshot(source,'2026-10-23')[0],r=adminResult(row);
 assert.equal(r.savedAt,'2026-10-24T01:00Z');assert.equal(row.capturedAt,'2026-10-24T03:00Z');assert.equal(r.modelProjection,.25);assert.equal(r.giScore,100);assert.equal(r.modelProbability,null);assert.equal(r.team,'Team');assert.equal(r.matchup,'Team vs Opponent');assert.equal(r.verifiedPick,false);assert.equal(r.status,'unknown');assert.match(r.reason,/participation/);
});
