import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {stageRankingImages,prepareRankingImage}=await loadTs(new URL('../lib/ranking-images.ts',import.meta.url));
test('category publication waits for decoded photos; cached visits avoid another image request',async()=>{
 const previous=globalThis.Image;let created=0;const releases=[];
 globalThis.Image=class{naturalWidth=100;constructor(){created++}set src(value){queueMicrotask(()=>this.onload())}decode(){return new Promise(resolve=>releases.push(resolve))}};
 try{
  let published=false;const result=stageRankingImages([{headshot:'decoded-photo',teamLogo:'decoded-logo'}]).then(rows=>{published=true;return rows});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(published,false);releases.forEach(resolve=>resolve());
  const rows=await result;assert.equal(rows[0].headshot,'decoded-photo');assert.equal(rows[0].teamLogo,'decoded-logo');assert.equal(await prepareRankingImage('decoded-photo'),true);assert.equal(created,2);
 }finally{globalThis.Image=previous}
});
test('failed or stalled photos become stable fallback avatars without blocking the category indefinitely',async()=>{
 const previous=globalThis.Image;
 globalThis.Image=class{set src(value){if(value==='bad-photo')queueMicrotask(()=>this.onerror())}};
 try{
  const [row]=await stageRankingImages([{headshot:'bad-photo',teamLogo:'stalled-logo',playerName:'Keep identity'}],15);
  assert.equal(row.headshot,'');assert.equal(row.teamLogo,'');assert.equal(row.playerName,'Keep identity');
 }finally{globalThis.Image=previous}
});
