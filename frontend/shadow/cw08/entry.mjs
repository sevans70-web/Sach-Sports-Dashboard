import {timingSafeEqual} from 'node:crypto';
import {study} from './domain.mjs';
export {NhlShadowCoordinator} from './coordinator.mjs';
function coordinator(env){return env.STUDY.getByName(study);}
export default {
 async scheduled(controller,env,ctx){
  if(controller.cron!=='*/15 * * * *')throw Error('unexpected_shadow_schedule');
  ctx.waitUntil(coordinator(env).tick());
 },
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&path==='/status')return Response.json(await coordinator(env).status(),{headers:{'Cache-Control':'no-store'}});
  if(request.method!=='POST'||path!=='/bootstrap')return new Response('Not found',{status:404});
  const actual=Buffer.from(request.headers.get('Authorization')||''),expected=Buffer.from('Bearer '+env.BOOTSTRAP_TOKEN);
  if(!env.BOOTSTRAP_TOKEN||actual.length!==expected.length||!timingSafeEqual(actual,expected))return new Response('Unauthorized',{status:401});
  const size=Number(request.headers.get('Content-Length'));if(!Number.isFinite(size)||size<=0||size>1500000)return new Response('Invalid size',{status:413});
  try{return Response.json(await coordinator(env).bootstrapReceipt(await request.json()));}catch{return Response.json({error:'seed_verification_failed',production:false},{status:422});}
 }
};
