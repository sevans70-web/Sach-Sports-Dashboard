import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTs} from './load-ts.mjs';
const root=await mkdtemp(join(tmpdir(),'featured-refresh-'));process.env.SACH_HISTORY_DIR=root;
const {saveFeaturedSelections}=await loadTs(new URL('../lib/featured-selection-capture.ts',import.meta.url));
const {todayTopPlays}=await loadTs(new URL('../lib/top-plays.ts',import.meta.url));
const {withHistoryLock}=await loadTs(new URL('../lib/history-lock.ts',import.meta.url));
const now=Date.parse('2026-10-29T14:00Z'),day='2026-10-29';
const row=id=>({playerId:id,playerName:id,gameId:'g',gameTime:'2026-10-29T20:00Z',market:'points',lineType:'main',sportsbook:'Book',sportsbookKey:'book',sportsbookLine:10.5,overPrice:350,underPrice:-450,quoteId:'q-'+id,quoteVersion:1,quoteUpdatedAt:'2026-10-29T13:59Z',capturedAt:'2026-10-29T14:00Z',researchForecast:{modelSelection:{side:'OVER',line:10.5,price:350,quoteId:'q-'+id,sportsbookKey:'book',calculatedAt:'2026-10-29T14:00Z'},priceComparison:{overProbability:.7,underProbability:.3,overExpectedReturn:2,underExpectedReturn:-.6}}});
test('queued dashboard refresh reserves the latest original before selecting alternatives in every sport',async()=>{
 try{
  for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb']){
   const rows=['a','b','c','d'].map(row),preview=todayTopPlays(rows,sport,now);
   const original={...preview.find(c=>c.key==='play').pick,row:{...rows[0],sportsbook:'Original Book',overPrice:500},price:500};
   let release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
   const blocker=withHistoryLock('featured-selections|'+sport+'|'+day,async()=>{entered();await gate;});await ready;
   const capture=saveFeaturedSelections(sport,preview.map(c=>({...c,pick:c.key==='value'?original:null})),day,now);
   const refresh=saveFeaturedSelections(sport,preview,day,now,undefined,rows);
   release();await blocker;await capture;const actual=await refresh;
   assert.deepEqual(actual.find(c=>c.key==='value').pick,original,sport+' preserves exact original');
   assert.equal(actual.find(c=>c.key==='play').pick.row.playerId,'b',sport+' chooses next player');
   assert.equal(actual.find(c=>c.key==='long').pick.row.playerId,'c',sport+' keeps long shot populated');
   const ids=actual.filter(c=>c.pick).map(c=>c.pick.row.playerId);assert.equal(new Set(ids).size,ids.length);
   const recovered={...original,row:{...original.row,gameTime:'2026-10-30T20:00Z',featuredRetained:true}};
   const next=await saveFeaturedSelections(sport,preview.map(c=>({...c,pick:c.key==='value'?recovered:null})),'2026-10-30',now,undefined,[]);
   assert.deepEqual(next.find(c=>c.key==='value').pick,recovered,sport+' preserves recovered next-slate evidence when the cache empties');
  }
 }finally{delete process.env.SACH_HISTORY_DIR;await rm(root,{recursive:true,force:true});}
});
