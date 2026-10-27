import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {mlbAdminSnapshot}=await loadTs(new URL('../lib/hidden-admin-history.ts',import.meta.url));
const {ADMIN_SPORTS,adminResult}=await loadTs(new URL('../lib/admin-policy.ts',import.meta.url));
const {VISIBLE_SPORTS}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
test('hidden sports remain available only in admin navigation',()=>{
 for(const sport of ['mlb','soccer','wnba']){assert.ok(ADMIN_SPORTS.includes(sport));assert.ok(!VISIBLE_SPORTS.includes(sport));}
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

test('bundled August MLB records retain pitcher identity, original zero statistics and legacy labels without inventing betting grades',async()=>{
 const {readBundledMlbHistory}=await loadTs(new URL('../lib/hidden-admin-history.ts',import.meta.url));
 const result=await readBundledMlbHistory(new Set(['2026-08-19']));assert.deepEqual(result.errors,[]);assert(result.rows.length>0);
 const pitchers=result.rows.filter(r=>r.historySection==='pitcher');assert(pitchers.length>1);assert(pitchers.every(r=>r.playerId&&r.playerName!=='Unknown player'));assert.equal(new Set(pitchers.map(r=>r.key)).size,pitchers.length);
 assert(result.rows.some(r=>r.actual===0));assert(result.rows.every(r=>r.status==='unknown'));assert(result.rows.some(r=>r.legacyResult));
});

test('cumulative MLB archives keep each original history date instead of assigning every entry the backup date',()=>{
 const payload={batter:{days:{'2026-09-02':{captured_at:'2026-09-02T10:00Z',categories:{hits:[{player_id:7,player_name:'Saved batter',actual_hits:0,result_label:'Original label'}]}},'2026-09-03':{captured_at:'2026-09-03T10:00Z',categories:{hits:[{player_id:7,player_name:'Saved batter',actual_hits:2}]}}}}};
 const before=JSON.stringify(payload),rows=mlbAdminSnapshot(payload,'2026-09-27');assert.deepEqual(rows.map(r=>r.gameDate),['2026-09-02','2026-09-03']);assert.deepEqual(rows.map(r=>r.actual),[0,2]);assert.equal(rows[0].legacyResult,'Original label');assert(rows.every(r=>r.status==='unknown'));assert.notEqual(rows[0].key,rows[1].key);assert.equal(JSON.stringify(payload),before);
});
