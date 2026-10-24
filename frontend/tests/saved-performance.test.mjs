import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
const {readSavedPerformance,historyDays,savedHistorySummary}=await loadTs(new URL('../lib/saved-performance.ts',import.meta.url));
test('read-only saved history preserves zero actuals, voids, pushes, original call and grades without approval filtering',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-history-'));
 try{
 await mkdir(path.join(root,'wnba'));
 const rows=[{key:'a',gameDate:'2026-10-23',market:'points',playerId:'1',status:'hit',actual:0,pickSide:'UNDER',sportsbookLine:1.5,savedAt:'2026-10-23T10:00Z',gameTime:'2026-10-23T20:00Z'},...['miss','push','void','pending','unknown'].map((status,i)=>({key:String(i),gameDate:'2026-10-23',market:'points',status}))];
 const file=path.join(root,'wnba','points_2026-10-23.json'),raw=JSON.stringify([...rows,rows[0]]);await writeFile(file,raw);
 const x=await readSavedPerformance('wnba','Week',new Date('2026-10-24T15:00Z'),root);
 assert.equal(x.summary.total,6);assert.equal(x.summary.completed,3);assert.equal(x.summary.hitRate,50);assert.equal(x.summary.awaitingResult,1);assert.equal(x.summary.void,1);assert.equal(x.summary.unknown,1);assert.equal(x.records[0].actual,0);assert.equal(x.records[0].pickSide,'UNDER');assert.equal(await readFile(file,'utf8'),raw);
 assert.equal((await readSavedPerformance('wnba','Today',new Date('2026-10-24T15:00Z'),root)).summary.total,0);
 await writeFile(path.join(root,'wnba','rebounds_2026-10-23.json'),'bad');
 assert.equal((await readSavedPerformance('wnba','Week',new Date('2026-10-24T15:00Z'),root)).coverage.complete,false);
 await assert.rejects(readSavedPerformance('nhl','Week',new Date(),root));
 }finally{await rm(root,{recursive:true,force:true});}
});
test('periods use Toronto days at midnight and retain a full year rollover',()=>{assert.deepEqual([...historyDays('Yesterday',new Date('2026-10-24T02:00Z'))],['2026-10-22']);assert.equal(historyDays('Season',new Date('2026-10-24T15:00Z')).size,370);});
test('late saves are visible and disclosed, not silently discarded or relabelled validated',()=>{const x=savedHistorySummary([{status:'hit',savedAt:'2026-10-23T20:01Z',gameTime:'2026-10-23T20:00Z'}]);assert.equal(x.hits,1);assert.equal(x.lateRecords,1);assert.equal(x.validatedPicks,undefined);});

test('periods follow the fixture day rather than the earlier day the forecast was first captured',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-history-day-'));
 try{await mkdir(path.join(root,'nfl'));await writeFile(path.join(root,'nfl','receiving_yards_2026-10-16.json'),JSON.stringify([{key:'k',market:'receiving_yards',status:'hit',gameDate:'2026-10-16',gameTime:'2026-10-18T17:00Z'}]));
 const x=await readSavedPerformance('nfl','Week',new Date('2026-10-24T15:00Z'),root);assert.equal(x.summary.total,1);assert.equal(x.records[0].gameDate,'2026-10-16');
 assert.equal((await readSavedPerformance('nfl','Today',new Date('2026-10-24T15:00Z'),root)).summary.total,0);
 }finally{await rm(root,{recursive:true,force:true});}
});
