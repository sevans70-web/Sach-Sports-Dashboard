import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm} from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {loadTs} from './load-ts.mjs';
test('NFL research refresh cannot withdraw, reactivate or overwrite existing historical picks',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'sach-nfl-retain-')),old=process.env.SACH_HISTORY_DIR;process.env.SACH_HISTORY_DIR=root;
 try{
  const api=await loadTs(new URL('../lib/nfl-history.ts',import.meta.url)),time=new Date(Date.now()+3600000).toISOString(),day=api.nflDay(time);
  const original={key:'original',playerId:'1',playerName:'Original',teamName:'A',gameDate:day,gameId:'a',gameTime:time,matchup:'A @ B',market:'passing_yards',sportsbookLine:250.5,modelProjection:270,pickSide:'OVER',savedAt:new Date().toISOString(),status:'pending',actual:null,withdrawnFromBoard:false};
  await api.saveGradedNflPredictions('passing_yards',day,[original]);
  assert.equal(await api.saveNflPregamePredictions('passing_yards',[{...original,sportsbookLine:150,prediction:'OVER'}],[]),false);
  assert.equal(await api.saveNflPregamePredictions('passing_yards',[],[]),false);
  assert.deepEqual((await api.getNflPredictions('passing_yards',day)).predictions,[original]);
 }finally{if(old===undefined)delete process.env.SACH_HISTORY_DIR;else process.env.SACH_HISTORY_DIR=old;await rm(root,{recursive:true,force:true})}
});
