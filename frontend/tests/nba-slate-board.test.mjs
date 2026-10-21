import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {loadTs} from './load-ts.mjs';
const root=await mkdtemp(path.join(tmpdir(),'nba-board-'));process.env.SACH_HISTORY_DIR=root;
const {selectPregameBoard,nbaSlateBoundary,frozenNbaSlateBoard,savePregameNbaSlateBoard,readNbaSlateBoard,nextNbaBoardDay}=await loadTs(new URL('../lib/nba-slate-board.ts',import.meta.url));
const {torontoHistoryDay}=await loadTs(new URL('../lib/history-archive.ts',import.meta.url));
const {writeDurableHistory}=await loadTs(new URL('../lib/durable-history.ts',import.meta.url));
const {savedModelPick}=await loadTs(new URL('../lib/saved-model-pick.ts',import.meta.url));
const {gradeSavedNbaPick,summarizeSavedPicks,nbaPickPerformance}=await loadTs(new URL('../lib/nba-pick-performance.ts',import.meta.url));
const day='2026-10-20',start='2026-10-20T19:00:00Z',capture='2026-10-20T18:59:00Z';
const quote={quoteVersion:1,quoteVerified:true,sportsbook:'Book',sportsbookKey:'book',quoteId:'q',sportsbookLine:10.5,overPrice:-110,underPrice:-110,lineType:'main',capturedAt:capture,quoteUpdatedAt:'2026-10-20T18:58:00Z'};
const rows=Array.from({length:25},(_,i)=>({...quote,rank:i+1,playerId:String(i),gameId:String(i%3),market:'points',gameTime:i%3===0?start:i%3===1?'2026-10-20T21:00:00Z':'2026-10-20T23:00:00Z',researchForecast:{modelSelection:{side:'OVER',line:10.5,price:-110,sportsbook:'Book',sportsbookKey:'book',quoteId:'q',calculatedAt:capture}}}));
const snapshot={capturedAt:capture,payload:{kind:'research_rankings',market:'points',rows}};
const games=[0,1,2].map(i=>({gameId:String(i),tipoff:rows[i].gameTime,state:i<2?'post':'in'}));
test('one daily 25 freezes before the first game and retains ranks, quotes and picks after earlier games finish',async()=>{
 const board=selectPregameBoard([snapshot],day,'points',Date.parse(start));
 assert.equal(board.rows.length,25);assert.equal(nbaSlateBoundary(games,Date.parse(start)).lockAt,Date.parse(start));
 await writeDurableHistory('nba','slate_board_points',day,[board]);
 const a=await frozenNbaSlateBoard('points',games,Date.parse('2026-10-20T22:00:00Z'));
 const b=await frozenNbaSlateBoard('points',games.map(g=>({...g,state:'post'})),Date.parse('2026-10-21T02:00:00Z'));
 for(const payload of [a,b]){
  assert.deepEqual(payload.rows.map(r=>[r.rank,r.playerId,r.quoteId,r.sportsbookLine,r.researchForecast]),rows.map(r=>[r.rank,r.playerId,r.quoteId,r.sportsbookLine,r.researchForecast]));
  assert.equal(payload.verifiedQuoteCount,25);assert.equal(payload.rows.every(r=>r.boardFrozen),true);
 }
 assert.equal(a.rows[0].gameState,'post');assert.equal(b.rows[2].gameState,'post');
 assert.equal(await frozenNbaSlateBoard('points',games,Date.parse(start)-1),null);
});
test('late snapshots cannot create pregame boards, and recovery never invents a missing pick',()=>{
 assert.equal(selectPregameBoard([{...snapshot,capturedAt:start}],day,'points',Date.parse(start)),null);
 assert.equal(selectPregameBoard([{...snapshot,payload:{...snapshot.payload,rows:[...rows,rows[0]]}}],day,'points',Date.parse(start)),null);
 const board=selectPregameBoard([{...snapshot,payload:{...snapshot.payload,rows:[{...rows[0],researchForecast:undefined}]}}],day,'points',Date.parse(start));
 assert.equal(savedModelPick(board.rows[0],board.capturedAt),null);
 for(const patch of [{quoteId:'wrong'},{line:9},{price:-115},{calculatedAt:start}])assert.equal(savedModelPick({...rows[0],researchForecast:{modelSelection:{...rows[0].researchForecast.modelSelection,...patch}}},capture),null);
});
const summary=(actual,dnp=false)=>({header:{id:'0',competitions:[{status:{type:{completed:true}}}]},boxscore:{players:[{statistics:[{labels:['PTS'],athletes:[{athlete:{id:'0'},didNotPlay:dnp,stats:[String(actual)]}]}]}]}});
test('tomorrow can be prepared and counted pending without replacing today or grading future results',async()=>{
 const now=Date.now(),stamp=new Date(now).toISOString(),tomorrow=nextNbaBoardDay(torontoHistoryDay()),tip=tomorrow+'T23:00:00Z';
 const before=await readNbaSlateBoard('points',day);
 const row={...rows[0],gameId:'tomorrow',gameTime:tip,quoteUpdatedAt:stamp,capturedAt:stamp,researchForecast:{modelSelection:{...rows[0].researchForecast.modelSelection,calculatedAt:stamp}}};
 const schedule=[{gameId:'tomorrow',tipoff:tip,state:'pre'}];
 const result=await savePregameNbaSlateBoard({market:'points',rows:[row]},schedule,now,tomorrow);
 assert.equal(result.boardSaved,true);assert.equal(result.boardDay,tomorrow);
 const saved=await readNbaSlateBoard('points',tomorrow);assert.equal(savedModelPick(saved.rows[0],saved.capturedAt).side,'OVER');
 assert.deepEqual(await readNbaSlateBoard('points',day),before);
 const performance=await nbaPickPerformance(['points'],[tomorrow],async()=>{throw Error('Must not grade before first tipoff')},now);
 assert.equal(performance.pending,1);assert.equal(performance.hitRate,null);
 assert.equal(await frozenNbaSlateBoard('points',schedule,now,tomorrow),null);
 const frozen=await frozenNbaSlateBoard('points',schedule,Date.parse(tip),tomorrow);
 assert.equal(frozen.rows[0].researchForecast.modelSelection.side,'OVER');assert.equal(frozen.rows[0].boardFrozen,true);
 assert.equal(nextNbaBoardDay('2026-12-31'),'2027-01-01');
});
test('actual pick grades require the exact official final fixture and athlete; missing stats remain pending',()=>{
 const row={...rows[0],pickSide:'OVER'};
 assert.equal(gradeSavedNbaPick(row,summary(11)).status,'hit');assert.equal(gradeSavedNbaPick(row,summary(10)).status,'miss');
 assert.equal(gradeSavedNbaPick({...row,sportsbookLine:10},summary(10)).status,'push');
 assert.equal(gradeSavedNbaPick(row,summary(0,true)).status,'void');
 assert.equal(gradeSavedNbaPick(row,summary('--')).status,'pending');
 assert.equal(gradeSavedNbaPick({...row,gameId:'99'},summary(20)).status,'pending');
 assert.equal(gradeSavedNbaPick({...row,playerId:'99'},summary(20)).status,'pending');
 const stats=summarizeSavedPicks(['hit','miss','push','pending','void'].map(status=>({status})));
 assert.equal(stats.total,5);assert.equal(stats.settled,3);assert.equal(stats.hitRate,50);assert.equal(stats.pending,1);
});
test('pick ledger counts only selections saved pregame and retains settled grades through provider failures',async()=>{
 await writeDurableHistory('nba','slate_board_points',day,[{version:1,day,market:'points',lockAt:start,capturedAt:capture,rows:[rows[0], {...rows[1],researchForecast:undefined}, {...rows[2],market:'assists'}]}]);
 const first=await nbaPickPerformance(['points'],[day],async()=>summary(12),Date.parse('2026-10-20T23:30:00Z'));
 assert.equal(first.total,1);assert.equal(first.hits,1);
 const outage=await nbaPickPerformance(['points'],[day],async()=>null,Date.parse('2026-10-20T23:30:00Z'));
 assert.equal(outage.hits,1);assert.equal(outage.pending,0);
 await rm(root,{recursive:true,force:true});
});
