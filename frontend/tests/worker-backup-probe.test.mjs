import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {checksum} from '../scripts/history-cloud.mjs';
import {verifyWorkerDriveBackup} from '../scripts/worker-backup-probe.mjs';

test('scheduled backup check writes a verified document once and verifies its readback each time', async () => {
 const payload = [{rank:1,playerName:'Recorded player'}];
 const doc = {sport:'nba',stream:'slate_board_points',game_date:'2026-11-09',checksum:checksum(payload),payload};
 const body = JSON.stringify({version:1,documents:[doc]});
 const digest = createHash('md5').update(body).digest('hex');
 const file = {id:'staging-test-file',md5Checksum:digest};
 let uploads = 0;
 let restored = body;
 const authenticate = () => ({
  async request(input, options){
   const url = new URL(input);
   if(url.searchParams.get('alt')==='media')return new Response(restored);
   if(options?.method==='POST'){
    uploads++;
    assert.match(options.headers['Content-Type'], /^multipart\/related; boundary=/);
    assert(options.body.includes(body));
    return Response.json(file);
   }
   return Response.json({files:uploads?[file]:[]});
  },
 });
 const env = {BACKUP_DRIVE_FOLDER_ID:'staging-folder'};
 const read = async () => [doc];
 assert.equal((await verifyWorkerDriveBackup(env,read,authenticate)).documents,1);
 await verifyWorkerDriveBackup(env,read,authenticate);
 assert.equal(uploads,1);
 restored = 'tampered';
 await assert.rejects(verifyWorkerDriveBackup(env,read,authenticate), /readback did not match/);
});
