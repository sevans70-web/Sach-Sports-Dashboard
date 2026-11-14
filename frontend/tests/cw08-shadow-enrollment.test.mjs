import test from 'node:test';import assert from 'node:assert/strict';
import {filterShadowEnrollment} from '../scripts/cw08-shadow-enrollment.mjs';
const row={key:'goals|1|2',receiptSha256:'a'.repeat(64)},ledger={kind:'cw08_cloudflare_shadow_enrollment',production:false,modelFrozenCommit:'007c02b',study:'cw08-nhl-v3-prospective-shadow',targets:[row]};
test('later quotes cannot replace enrolled receipts; new enrollment ignores direction and EV',()=>{
 const previous={target:{market:'goals',gameId:'1',playerId:'2'},quote:{line:1.5,overPrice:999}},newUnder={target:{market:'goals',gameId:'1',playerId:'3'},side:'UNDER',ev:-1},newOver={target:{market:'assists',gameId:'1',playerId:'2'},side:'OVER',ev:1};
 const bundle={entries:[previous,newUnder,newOver],rejections:[]},before=structuredClone(bundle),result=filterShadowEnrollment(bundle,ledger);
 assert.deepEqual(result.bundle.entries,[newUnder,newOver]);assert.equal(result.bundle.entries[0],newUnder);assert.deepEqual(bundle,before);assert.deepEqual(result.excluded,[{key:'goals|1|2',reason:'first_verified_receipt_already_enrolled'}]);
});
test('invalid or duplicated enrollment fails closed',()=>{
 for(const patch of [{production:true},{modelFrozenCommit:'another'},{targets:[row,row]},{targets:[{...row,receiptSha256:'bad'}]}])assert.throws(()=>filterShadowEnrollment({entries:[]},{...ledger,...patch}),/enrollment/);
});
