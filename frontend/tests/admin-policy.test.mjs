import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {isAdminUser,sameOriginMutation,adminResult,adminResultCounts}=await loadTs(new URL('../lib/admin-policy.ts',import.meta.url));
test('admin identity needs exact dashboard email and verified email, never user metadata or a tester flag',()=>{
 const valid={id:'u1',email:'sachsportsplatform@gmail.com',email_confirmed_at:'2026-10-18T20:00:00Z',is_anonymous:false};
 assert.equal(isAdminUser(valid),true);
 for(const user of [null,{...valid,email:'sevans70@hotmail.com'},{...valid,email:'sachsportsplatform@gmail.com.evil.test'},{...valid,email_confirmed_at:null},{...valid,is_anonymous:true},{...valid,id:''},{...valid,email:'tester@example.test',user_metadata:{role:'admin'}}])assert.equal(isAdminUser(user),false);
});
test('authentication mutations reject absent, foreign and cross-site origins',()=>{
 const base='https://dashboard.example';
 assert.equal(sameOriginMutation(base,base,'same-origin'),true);
 assert.equal(sameOriginMutation(null,base),false);
 assert.equal(sameOriginMutation('https://evil.example',base),false);
 assert.equal(sameOriginMutation(base,base,'cross-site'),false);
});
test('result inspection retains the saved side and line without inventing a pick from a baseline',()=>{
 const source={key:'k',status:'research',historicalStatus:'miss',archivedOriginal:{prediction:'UNDER',sportsbookLine:14.5},actual:20,modelProjection:10,quoteVerified:false};
 const before=JSON.stringify(source),row=adminResult(source);
 assert.equal(row.side,'UNDER');assert.equal(row.line,14.5);assert.equal(row.actual,20);assert.equal(row.status,'miss');assert.equal(row.verifiedPick,false);assert.equal(JSON.stringify(source),before);
 assert.equal(adminResult({modelProjection:20,sportsbookLine:10}).side,null);
 assert.equal(adminResult({historicalStatus:'hit',withdrawnFromBoard:true}).status,'void');
});
test('the listed research decisions account for settled totals and exclude pushes from hit rate',()=>{
 const rows=[{status:'hit'},{status:'miss'},{status:'push'},{status:'pending'},{status:'hit',withdrawnFromBoard:true},{status:'research'}].map(adminResult);
 assert.deepEqual(adminResultCounts(rows),{total:6,hits:1,misses:1,pushes:1,settled:3,pending:1,void:1,unknown:1,hitRate:50});
});
