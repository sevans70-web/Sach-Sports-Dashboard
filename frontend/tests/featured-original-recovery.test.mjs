import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTs} from './load-ts.mjs';
const root=await mkdtemp(join(tmpdir(),'featured-recovery-'));
process.env.SACH_HISTORY_DIR=root;
const {readFeaturedOriginals,mergeFeaturedOriginals}=await loadTs(new URL('../lib/featured-originals.ts',import.meta.url));
const {featuredHistoryDays}=await loadTs(new URL('../lib/featured-history-days.ts',import.meta.url));
const {saveFeaturedSelections}=await loadTs(new URL('../lib/featured-selection-capture.ts',import.meta.url));
const day='2026-10-29',now=Date.parse('2026-10-29T23:00Z');
const original={key:'long',title:'Long Shot',pick:{price:550,probability:20,basis:'bookmaker_implied',row:{playerId:'original',playerName:'Original player',gameId:'123',gameTime:'2026-10-29T20:00Z',market:'anytime_td',prediction:'YES',sportsbook:'Original Book',sportsbookKey:'original',sportsbookLine:.5,quoteId:'original-quote',overPrice:550,quoteUpdatedAt:'2026-10-29T13:00Z',featuredSavedAt:'2026-10-29T13:01Z'}}};
const later={...original,pick:{...original.pick,price:900,row:{...original.pick.row,playerId:'later',quoteId:'later-quote',overPrice:900}}};
const receipt=[{savedAt:'2026-10-29T13:01Z',payload:original}];
test('protected featured originals survive missing and replaced summaries across all eight sports',async()=>{
 try{
  for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb']){
   const dir=join(root,sport);await mkdir(dir,{recursive:true});
   const protectedFile=join(dir,'protected_featured_original_long_'+day+'.json');
   await writeFile(protectedFile,JSON.stringify(receipt));
   assert.deepEqual(await readFeaturedOriginals(sport,day),[original],sport+' recovers without summary');
   assert.deepEqual((await featuredHistoryDays(sport,[day])).boards,[{day,choices:[original]}],sport+' history recovers without summary');
   await writeFile(join(dir,'featured_selections_'+day+'.json'),JSON.stringify([later]));
   assert.deepEqual(await readFeaturedOriginals(sport,day),[original],sport+' receipt overrides later summary');
   assert.deepEqual((await featuredHistoryDays(sport,[day])).boards,[{day,choices:[original]}],sport+' performance uses original');
   assert.deepEqual(await saveFeaturedSelections(sport,[later],day,now),[original],sport+' refresh preserves original');
   assert.deepEqual(JSON.parse(await readFile(protectedFile,'utf8')),receipt,sport+' never rewrites evidence');
  }
 }finally{delete process.env.SACH_HISTORY_DIR;await rm(root,{recursive:true,force:true});}
});
test('recovery rejects wrong-day and wrong-category receipts without inventing missing categories',()=>{
 assert.deepEqual(mergeFeaturedOriginals([{stream:'protected_featured_original_play',payload:receipt}],day),[]);
 assert.deepEqual(mergeFeaturedOriginals([{stream:'protected_featured_original_long',payload:receipt}],'2026-10-30'),[]);
 assert.deepEqual(mergeFeaturedOriginals([],day),[]);
});
