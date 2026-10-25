import test from 'node:test';
import assert from 'node:assert/strict';
import {readCloudDocumentsForDay,checksum} from '../scripts/history-cloud.mjs';
test('featured hydration queries only requested sport, day and streams',async()=>{
 const oldFetch=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_SECRET_KEY;
 process.env.SUPABASE_URL='https://test.invalid';process.env.SUPABASE_SECRET_KEY='test';let urls=[];
 const payload=[{market:'first_basket',rows:[{playerName:'Exact player',overPrice:550}]}];
 globalThis.fetch=async url=>{urls.push(String(url));return Response.json([{stream:'featured_first_basket',game_date:'2026-10-24',payload,checksum:checksum(payload)}]);};
 try{
  const rows=await readCloudDocumentsForDay('nba',['featured_points','featured_first_basket'],'2026-10-24');
  assert.equal(rows[0].payload[0].rows[0].overPrice,550);assert.equal(urls.length,1);
  assert.match(urls[0],/sport=eq.nba&game_date=eq.2026-10-24&stream=in.\(featured_points,featured_first_basket\)/);
  globalThis.fetch=async()=>Response.json([{payload,checksum:'wrong'}]);
  await assert.rejects(readCloudDocumentsForDay('nba',['featured_points'],'2026-10-24'),/checksum mismatch/);
  await assert.rejects(readCloudDocumentsForDay('nba',['bad,stream'],'2026-10-24'),/Invalid history scope/);
 }finally{globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.SUPABASE_SECRET_KEY;else process.env.SUPABASE_SECRET_KEY=oldKey;}
});
