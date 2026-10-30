import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readdir,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadTs} from './load-ts.mjs';
const root=await mkdtemp(join(tmpdir(),'featured-outage-'));process.env.SACH_HISTORY_DIR=root;
const {saveFeaturedSelections}=await loadTs(new URL('../lib/featured-selection-capture.ts',import.meta.url));
const {readDurableHistoryBatch}=await loadTs(new URL('../lib/durable-history.ts',import.meta.url));
const day='2026-10-30';
const card={key:'long',pick:{price:550,row:{playerId:'replacement',gameTime:'2026-10-30T20:00Z',market:'anytime_td',sportsbook:'Book'}}};
test('history outages never authorize replacement featured originals in any sport',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';
 let reads=0,writes=0;globalThis.fetch=async(url,options)=>{if(options?.method==='POST')writes++;else reads++;return Response.json({message:'unavailable'},{status:503});};
 try{
  for(const sport of ['nba','nfl','cfb','nhl','cbb','soccer','wnba','mlb']){
   const dir=join(root,sport);await mkdir(dir,{recursive:true});
   const existing=JSON.stringify([{key:'play',pick:null}]);await writeFile(join(dir,'featured_selections_'+day+'.json'),existing);
   await assert.rejects(saveFeaturedSelections(sport,[card],day,Date.parse('2026-10-30T14:00Z')),/Cloud history HTTP 503/);
   assert.deepEqual(await readdir(dir),['featured_selections_'+day+'.json']);
   assert.equal(await readFile(join(dir,'featured_selections_'+day+'.json'),'utf8'),existing);
  }
  assert.equal(writes,0);assert.equal(reads,8);
  // Existing non-featured callers retain their explicitly best-effort behavior.
  assert.deepEqual(await readDurableHistoryBatch('nba',['missing'],day),[]);
 }finally{
  globalThis.fetch=oldFetch;
  if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;
  if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;
  delete process.env.SACH_HISTORY_DIR;await rm(root,{recursive:true,force:true});
 }
});
