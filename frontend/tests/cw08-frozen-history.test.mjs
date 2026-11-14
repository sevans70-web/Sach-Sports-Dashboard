import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {pathToFileURL} from 'node:url';import {execFileSync} from 'node:child_process';
import {ensureFrozenHistory,frozenCommits} from '../shadow/cw08/frozen-history.mjs';
const git=(cwd,args)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
test('shallow manual checkout fetches only pinned historical objects without moving HEAD or replacing current files',async()=>{
 const work=await mkdtemp(join(tmpdir(),'cw08-history-')),origin=join(work,'origin'),clone=join(work,'clone');
 try{
  git(work,['init',origin]);await writeFile(join(origin,'frozen.json'),'original\n');git(origin,['add','.']);git(origin,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','frozen']);const frozen=git(origin,['rev-parse','HEAD']);
  await writeFile(join(origin,'frozen.json'),'current working value\n');git(origin,['add','.']);git(origin,['-c','user.name=Test','-c','user.email=test@example.invalid','commit','-m','later']);const head=git(origin,['rev-parse','HEAD']);
  git(work,['clone','--depth=1','--no-tags',pathToFileURL(origin).href,clone]);assert.equal(git(clone,['rev-parse','--is-shallow-repository']),'true');assert.throws(()=>git(clone,['cat-file','-e',frozen+'^{commit}']));
  assert.deepEqual(ensureFrozenHistory(clone,[frozen]),{head,fetched:[frozen]});assert.equal(git(clone,['show',frozen+':frozen.json']),'original');assert.equal(git(clone,['rev-parse','HEAD']),head);assert.equal(await readFile(join(clone,'frozen.json'),'utf8'),'current working value\n');assert.equal(git(clone,['status','--porcelain']),'');
  assert.deepEqual(ensureFrozenHistory(clone,[frozen]),{head,fetched:[]});assert.throws(()=>ensureFrozenHistory(clone,['0'.repeat(40)]),/Frozen reference unavailable/);assert.equal(git(clone,['rev-parse','HEAD']),head);
 }finally{await rm(work,{recursive:true,force:true});}
});
test('historic fetch refuses abbreviated or arbitrary refs and pins all actual frozen provenance commits',()=>{
 assert.throws(()=>ensureFrozenHistory('/unused',['007c02b']),/Full pinned/);assert.throws(()=>ensureFrozenHistory('/unused',['main']),/Full pinned/);assert.equal(frozenCommits.length,3);assert.ok(frozenCommits.every(x=>/^[a-f0-9]{40}$/.test(x)));
});
