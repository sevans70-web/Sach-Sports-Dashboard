import {gzipSync} from 'node:zlib';
import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';import {loadTs} from './load-ts.mjs';
test('cold archive reads stream exact bytes, verify the saved MD5 and fail on an altered copy without writing local files',async()=>{
 const oldFetch=globalThis.fetch,keys=['SUPABASE_URL','SUPABASE_SECRET_KEY','GOOGLE_OAUTH_CLIENT_ID','GOOGLE_OAUTH_CLIENT_SECRET','GOOGLE_OAUTH_REFRESH_TOKEN'],old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 for(const k of keys)process.env[k]='test';process.env.SUPABASE_URL='https://test.invalid';
 const raw='[{"payload":{"actual":0,"opponent":"équipe"}}]';let md5=createHash('md5').update(raw).digest('hex'),altered=false,compressed=false;
 globalThis.fetch=async(url)=>{const u=String(url);if(u.includes('history_archive_files'))return Response.json([{drive_file_id:'copy',md5}]);if(u.includes('oauth2'))return Response.json({access_token:'test-token'});return new Response(compressed?gzipSync(raw):altered?raw+' ':raw);};
 try{const {visitCloudArchive}=await loadTs(new URL('../lib/drive-history-reader.ts',import.meta.url));let text='';assert.equal(await visitCloudArchive('sach-history/wnba/archive/points_2026-10-16.json',async stream=>{for await(const chunk of stream)text+=chunk;}),true);assert.equal(text,raw);altered=true;await assert.rejects(visitCloudArchive('path',async stream=>{for await(const _ of stream){}}),/checksum mismatch/);compressed=true;altered=false;md5=createHash('md5').update(gzipSync(raw)).digest('hex');let decoded='';await visitCloudArchive('copy.json.gz',async stream=>{for await(const chunk of stream)decoded+=chunk;});assert.equal(decoded,raw);
 }finally{globalThis.fetch=oldFetch;for(const k of keys)if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];}
});
