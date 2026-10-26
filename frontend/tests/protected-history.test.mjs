import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';import path from 'node:path';import {tmpdir} from 'node:os';import {loadTs} from './load-ts.mjs';
const {protectHistory,replicateProtectedHistory}=await loadTs(new URL('../lib/protected-history.ts',import.meta.url));
test('original survives replacement attempts and cloud failure until verified retry',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-protected-')),day='2026-10-25',pick={player:'Original',market:'anytime_td',price:500,selectedAt:'2026-10-25T12:00Z'};
 try{await Promise.all([protectHistory('nfl','featured_original_long',day,pick,root),protectHistory('nfl','featured_original_long',day,{player:'Replacement'},root)]);
 const file=path.join(root,'nfl','protected_featured_original_long_'+day+'.json'),before=await readFile(file,'utf8');assert.deepEqual(JSON.parse(before)[0].payload,pick);
 const fail=await replicateProtectedHistory('nfl',root,8,async()=>{throw Error('cloud unavailable')});assert.equal(fail.pending,1);assert.equal(fail.verified,0);assert.equal(fail.errors.length,1);assert.equal(await readFile(file,'utf8'),before);
 let uploaded;const pass=await replicateProtectedHistory('nfl',root,8,async(sport,stream,day,rows)=>{uploaded=rows;return true;});assert.equal(pass.verified,1);assert.deepEqual(uploaded[0].payload,pick);assert.deepEqual(await readdir(path.join(root,'_system','protected-outbox')),[]);assert.equal(await readFile(file,'utf8'),before);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('all eight sports retain separate pregame and final receipts',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'sach-all-sports-'));try{for(const sport of ['nfl','cfb','nba','nhl','cbb','soccer','wnba','mlb']){await protectHistory(sport,'pregame_g_points','2026-10-25',{line:0.5,price:-110},root);await protectHistory(sport,'final_g','2026-10-25',{actual:0},root);assert.equal((await readdir(path.join(root,sport))).length,2);}}finally{await rm(root,{recursive:true,force:true});}
});
