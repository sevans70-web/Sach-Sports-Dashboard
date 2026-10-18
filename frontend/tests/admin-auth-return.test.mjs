import test from 'node:test';
import assert from 'node:assert/strict';
import {loadTs} from './load-ts.mjs';
const {adminAuthReturn,adminAuthFragment,adminEmailLink}=await loadTs(new URL('../lib/admin-auth-return.ts',import.meta.url));
test('email returns support implicit fragments and query-based token hashes',()=>{
 assert.deepEqual(adminAuthReturn('','#access_token=a&refresh_token=r'),{kind:'session',accessToken:'a',refreshToken:'r'});
 assert.deepEqual(adminAuthReturn('?token_hash=hash&type=signup',''),{kind:'token',tokenHash:'hash',type:'signup'});
 assert.deepEqual(adminAuthReturn('','#token_hash=hash&type=magiclink'),{kind:'token',tokenHash:'hash',type:'magiclink'});
});
test('pasted provider links are verified directly and cannot trigger arbitrary URL fetches or redirects',()=>{
 const provider='https://project.supabase.co';
 assert.deepEqual(adminEmailLink(provider+'/auth/v1/verify?token=valid&type=signup&redirect_to=http://localhost:3000',provider),{tokenHash:'valid',type:'signup'});
 assert.equal(adminEmailLink('https://evil.test/auth/v1/verify?token=valid',provider),null);
 assert.equal(adminEmailLink(provider+'/other?token=valid',provider),null);
 assert.equal(adminEmailLink('https://user:password@project.supabase.co/auth/v1/verify?token=valid',provider),null);
 assert.equal(adminEmailLink(provider+'/auth/v1/verify?token=valid&type=email_change',provider),null);
});
test('missing and incomplete credentials cannot become authenticated callbacks',()=>{
 assert.deepEqual(adminAuthReturn('',''),{kind:'none'});
 assert.deepEqual(adminAuthReturn('','#access_token=only'),{kind:'none'});
 assert.deepEqual(adminAuthReturn('?token_hash=hash&type=email_change',''),{kind:'none'});
 assert.deepEqual(adminAuthReturn('?code=code',''),{kind:'code'});
 assert.deepEqual(adminAuthReturn('','#error_description=expired'),{kind:'error'});
});
test('callback forwarding uses a fragment and never copies arbitrary destinations or provider error text',()=>{
 const parsed=adminAuthReturn('?token_hash=hash&type=email&next=https://evil.test','');
 assert.equal(adminAuthFragment(parsed),'#token_hash=hash&type=email');
 assert.equal(adminAuthFragment(adminAuthReturn('?error_description=private-details','')),'#error=email_link_expired');
 assert.equal(adminAuthFragment({kind:'none'}),'');
});
