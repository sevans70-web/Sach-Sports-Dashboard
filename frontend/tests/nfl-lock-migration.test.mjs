import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {loadTs} from './load-ts.mjs';
test('slate migration retains original 1 PM evidence captured after an international kickoff; optional progress misses never query cloud',async()=>{
 const root=await mkdtemp(join(tmpdir(),'sach-lock-migration-'));process.env.SACH_HISTORY_DIR=root;process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
 const originalFetch=globalThis.fetch;let network=0;globalThis.fetch=async()=>{network++;throw Error('unavailable optional cloud')};
 try{
 const capturedAt='2026-10-25T16:55:00Z',row={market:'passing_yards',playerId:'p',gameId:'later',rank:5,gameTime:'2026-10-25T17:00:00Z',sportsbookLine:245.5,researchForecast:{status:'available',projection:230,modelSelection:{side:'UNDER',calculatedAt:capturedAt}}};
 await mkdir(join(root,'nfl'));await writeFile(join(root,'nfl','locked_research_passing_yards_2026-10-25.json'),JSON.stringify([{capturedAt,rows:[row]}]));
 const {lockedNflBoard}=await loadTs(new URL('../lib/nfl-locked-board.ts',import.meta.url));
 const board=await lockedNflBoard('passing_yards',[{id:'morning',date:'2026-10-25T13:30Z',state:'post'},{id:'later',date:row.gameTime,state:'in'}],Date.parse('2026-10-25T19:00Z'));
 assert.equal(board.rows.length,1);assert.equal(board.rows[0].sportsbookLine,245.5);assert.deepEqual(board.rows[0].researchForecast,row.researchForecast);assert.equal(board.rows[0].boardCapturedAt,capturedAt);assert.equal(network,0);
 const {attachRecordedProgressLines}=await loadTs(new URL('../lib/recorded-progress.ts',import.meta.url));
 const payload={market:'receiving_yards',rows:[{gameId:'g',playerId:'p',gameTime:new Date(Date.now()-3600000).toISOString(),sportsbookLine:null}]};
 const beforeProgress=network;const value=await attachRecordedProgressLines(payload,'nfl');assert.equal(value.rows[0].progressQuote,null);assert.equal(network,beforeProgress);
 for(let i=0;i<100;i++){try{await stat(join(root,'nfl','slate_locked_v2_passing_yards_early_2026-10-25.json'));break}catch{await new Promise(resolve=>setImmediate(resolve))}}
 }finally{globalThis.fetch=originalFetch;delete process.env.SACH_HISTORY_DIR;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_SECRET_KEY;await rm(root,{recursive:true,force:true})}
});
