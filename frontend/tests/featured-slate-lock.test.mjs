import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {loadTs} from './load-ts.mjs';
test('all eight sports retain the first saved featured player and original pregame price through later recalculations',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sach-featured-lock-'));process.env.SACH_HISTORY_DIR=root;
 try{const {saveFeaturedSelections}=await loadTs(new URL('../lib/featured-selection-capture.ts',import.meta.url));
 const pick=(id,price)=>({row:{playerId:id,gameTime:'2026-10-25T17:00:00Z',market:'anytime_td',sportsbook:'Original Book',sportsbookKey:'original',sportsbookLine:.5,overPrice:price,capturedAt:'2026-10-25T12:00:00Z'},price,basis:'bookmaker'});
 for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){
 const original=['play','value','long','first'].map((key,i)=>({key,pick:pick(String(i),500+i)}));
 await saveFeaturedSelections(sport,original,'2026-10-25',Date.parse('2026-10-25T12:00Z'));
 for(const at of ['2026-10-25T13:00Z','2026-10-25T20:00Z']){
 const newer=original.map((card,i)=>({...card,pick:pick('new'+i,900)}));
 assert.deepEqual(await saveFeaturedSelections(sport,newer,'2026-10-25',Date.parse(at)),original);
 }
 }
 }finally{delete process.env.SACH_HISTORY_DIR;await rm(root,{recursive:true,force:true})}
});
