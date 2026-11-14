// Local-only harness. The production build never imports this module.
import {verifyForecast} from '../../shadow/cw08/domain.mjs';
import production from '../../shadow/cw08/entry.mjs';
import {NhlShadowCoordinator as Coordinator} from '../../shadow/cw08/coordinator.mjs';
export class NhlShadowCoordinator extends Coordinator {
 now(){return this.meta('testNow')||Date.now();}
 async test(action,value){
  if(action==='clock'){this.setMeta('testNow',value);return this.status();}
  if(action==='tick')return this.tick();
  if(action==='step'){await this.alarm();return this.status();}
  if(action==='fault'){this.setMeta('testFault',value);return this.status();}
  if(action==='inspect')return {receipts:this.rows('SELECT * FROM receipts ORDER BY target'),objects:this.rows('SELECT key,hash,state,kind,anchor_status FROM objects ORDER BY key'),cycles:this.rows('SELECT * FROM cycles ORDER BY id'),storageError:this.meta('lastStorageError'),testError:this.meta('testError')};
  if(action==='clearLease'){this.setMeta('lease',null);return this.status();}
  if(action==='lease'){this.setMeta('lease',value);return this.status();}
  if(action==='verify'){return {target:verifyForecast(value).target};}
  if(action==='bootstrap'){return this.bootstrapReceipt(value);}
  throw Error('invalid_test_action');
 }
 async step(job,id,token){try{return await super.step(job,id,token);}catch(error){this.setMeta('testError',{message:error.message,stack:error.stack});throw error;}}
 async putObject(row){
  const fault=this.meta('testFault');
  if(fault==='before_put'&&row.kind==='receipts'){this.setMeta('testFault',null);throw Error('injected_storage_failure');}
  const object=await super.putObject(row);
  if(fault==='after_put'&&row.kind==='receipts'){this.setMeta('testFault',null);throw Error('injected_ack_loss');}
  if(fault==='grade_after_put'&&row.kind==='grades'){this.setMeta('testFault',null);throw Error('injected_grade_ack_loss');}
  return object;
 }
}
export default {
 ...production,
 async fetch(request,env,ctx){const url=new URL(request.url);if(url.pathname==='/__test'){const {action,value}=await request.json();return Response.json(await env.STUDY.getByName('cw08-nhl-v3-prospective-shadow').test(action,value));}return production.fetch(request,env,ctx);}
};
