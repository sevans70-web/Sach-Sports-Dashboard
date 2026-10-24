import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readdir,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('hidden WNBA final-game capture records all finals without dashboard visits, picks or grade writes',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-hidden-games-')),oldRoot=process.env.SACH_HISTORY_DIR,originalFetch=globalThis.fetch;process.env.SACH_HISTORY_DIR=root;
 try{
 globalThis.fetch=async(input)=>{const u=String(input);return Response.json(u.includes('scoreboard')?{events:[{id:'11',status:{type:{completed:true}}},{id:'22',status:{type:{completed:true}}},{id:'33',status:{type:{completed:false}}}]}:{header:{id:new URL(u).searchParams.get('event')},boxscore:{players:[{team:{id:'one'},statistics:[]},{team:{id:'two'},statistics:[]}]}})};
 const {captureHiddenSportGames}=await loadTs(new URL('../lib/hidden-sport-game-capture.ts',import.meta.url));const x=await captureHiddenSportGames('wnba',new Date('2026-10-24T15:00Z'));assert.equal(x.success,true);assert.equal(x.saved,6);
 const files=await readdir(path.join(root,'wnba','archive','segments'));assert.equal(files.length,6);assert.ok(files.every(n=>n.startsWith('official_game_')));const snapshots=await loadTs(new URL('../lib/history-archive.ts',import.meta.url));const saved=await snapshots.readHistorySnapshots('wnba','official_game_11','2026-10-24');assert.equal(saved[0].payload.kind,'official_final_game');assert.equal(saved[0].payload.status,undefined);
 }finally{globalThis.fetch=originalFetch;if(oldRoot===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=oldRoot;await rm(root,{recursive:true,force:true});}
});
