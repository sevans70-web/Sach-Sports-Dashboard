import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
const dir=await mkdtemp(path.join(os.tmpdir(),'all-sport-featured-'));process.env.SACH_HISTORY_DIR=dir;
const {DASHBOARD_SPORTS}=await loadTs(new URL('../lib/dashboard-contract.ts',import.meta.url));
const {todayTopPlays,topPlayDay}=await loadTs(new URL('../lib/top-plays.ts',import.meta.url));
const {captureFeaturedSelections}=await loadTs(new URL('../lib/featured-selection-capture.ts',import.meta.url));
const {readDurableHistory}=await loadTs(new URL('../lib/durable-history.ts',import.meta.url));
const now=Date.parse('2026-10-24T14:00Z');
const q={playerId:'1',gameId:'g',playerName:'Saved scorer',gameTime:'2026-10-24T18:00Z',capturedAt:'2026-10-24T14:00Z',quoteUpdatedAt:'2026-10-24T13:59Z',quoteVersion:1,sportsbook:'Book',sportsbookKey:'book',lineType:'scorer',overPrice:550};
test('every dashboard has three core categories and preserves captured choices without a page view',async()=>{
 try{
  for(const sport of DASHBOARD_SPORTS){
   const market=['nba','wnba','cbb'].includes(sport)?'first_basket':'first_td';
   const cards=todayTopPlays([{...q,market}],sport,now);
   for(const key of ['play','value','long'])assert.ok(cards.some(c=>c.key===key),sport+' '+key);
   await captureFeaturedSelections(sport,[{market,rows:[q]}],now);
   await captureFeaturedSelections(sport,[{market,rows:[]}],Date.parse(q.gameTime)+60000);
   const saved=await readDurableHistory(sport,'featured_selections','2026-10-24');
   assert.equal(saved.find(c=>c.key===(market==='first_basket'?'first':'long')).pick.row.playerName,'Saved scorer',sport);
   await captureFeaturedSelections(sport,[{market,rows:[{...q,gameTime:'2026-10-25T18:00Z'}]}],now);
   const next=await readDurableHistory(sport,'featured_selections','2026-10-25');
   assert.equal(next.find(c=>c.key===(market==='first_basket'?'first':'long')).pick.row.gameTime,'2026-10-25T18:00Z',sport+' next slate');
  }
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('no games today uses next available slate while existing today games retain today scope',()=>{
 const tomorrow={...q,market:'first_td',gameTime:'2026-10-25T18:00Z'};
 assert.equal(topPlayDay([tomorrow],now),'2026-10-25');assert.ok(todayTopPlays([tomorrow],'nfl',now).find(c=>c.key==='long').pick);
 assert.equal(topPlayDay([tomorrow,q],now),'2026-10-24');
});
