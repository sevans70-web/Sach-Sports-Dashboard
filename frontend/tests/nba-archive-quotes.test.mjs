import test from 'node:test';import assert from 'node:assert/strict';import {loadTs} from './load-ts.mjs';
const {nbaArchiveQuotes}=await loadTs(new URL('../lib/nba-archive-quotes.ts',import.meta.url));
const target={sport:'nba',market:'points',gameId:'1',playerId:'2',playerName:'Player A',gameTime:'2026-04-01T23:00:00Z',workload:30};
const row={game_id:'1',player_id:'2',player_name:'Player A',market:'player_points',bookmaker:'pinnacle',line:20.5,over_odds:-110,under_odds:-110,captured_at:'2026-04-01T22:55:00Z'};
const run=props=>nbaArchiveQuotes({snapshot_type:'closing',count:props.length,props},[target],'1','2026-10-20T00:00:00Z');
test('archive retains exact source prices and timestamp with retrospective provenance',()=>{
 const [q]=run([row]).quotes;assert.equal(q.line,20.5);assert.equal(q.overPrice,-110);assert.equal(q.decisionAt,row.captured_at);assert.equal(q.provenance.collection,'retrospective');
});
test('wrong identities, post-start timestamps, alternates and ambiguous book prices abstain',()=>{
 for(const change of [{game_id:'3'},{player_id:'4'},{player_name:'Another Player'},{captured_at:'2026-04-01T23:01:00Z'},{is_alternate:true},{under_odds:null},{line:20.8}])assert.equal(run([{...row,...change}]).quotes.length,0);
 assert.equal(run([row,{...row,line:21.5}]).quotes.length,0);
 assert.throws(()=>nbaArchiveQuotes({snapshot_type:'closing',count:5,props:[row]},[target],'1','2026-10-20'),/Incomplete/);
 assert.equal(nbaArchiveQuotes({snapshot_type:'closing',count:1,props:[row]},[{...target,workload:0}],'1','2026-10-20').quotes.length,0);
});
