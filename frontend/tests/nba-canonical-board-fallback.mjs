import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {statSync} from 'node:fs';
import {isAbsolute,join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const [psql, socket, port, database, baselineCheckout] = process.argv.slice(2);
assert.ok(baselineCheckout, 'Provide psql, an absolute socket directory, port, fixture database, and version 335 checkout');
assert.match(port, /^[0-9]+$/);
assert.ok(isAbsolute(socket));
assert.ok(statSync(join(resolve(socket),'.s.PGSQL.'+port)).isSocket());
assert.match(database, /^sach_nba_board_test_[a-z0-9_]+$/);
const env = Object.fromEntries(Object.entries(process.env).filter(([k])=>!k.startsWith('PG')));
function sql(statement) {
  return execFileSync(psql, ['-XqAt','-h',socket,'-p',port,'-d',database,'-v','ON_ERROR_STOP=1','-c',statement],
    {encoding:'utf8',env:{...env,PGPASSFILE:join(socket,'unused-pgpass')},timeout:10000}).trim();
}
assert.equal(
  execFileSync('git', ['-C',baselineCheckout,'rev-parse','HEAD'], {encoding:'utf8'}).trim(),
  'a949453dac8d3ae08a3feeca99dc55fe1991d267',
);
const file = 'frontend/scripts/history-cloud.mjs';
execFileSync('git', ['-C',baselineCheckout,'diff','--quiet','HEAD','--',file]);
const baseline = join(resolve(baselineCheckout),file);
const {checksum, readCloudDocument, cloudHistoryReadOnly, saveCloudDocument} = await import(pathToFileURL(baseline));
const escape = s => "'" + s.replaceAll("'", "''") + "'";
assert.equal(sql('select inet_server_addr() is null'), 't');
const board = JSON.parse(sql("select payload from public.history_documents where sport='nba' and stream='slate_board_points' and game_date > '2020-01-08'"));
board[0].market = 'threes_made';
board[0].rows[0].market = 'threes_made';
const day = board[0].day;
const captured = board[0].capturedAt;
sql("set role service_role; insert into public.history_documents(sport,stream,game_date,checksum,payload,source_updated_at) values ('nba','slate_board_threes_made',"
  + [day,checksum(board),JSON.stringify(board),captured].map(escape).join(',') + ');');
const unrelated = [{verifiedFixture:true}];
sql("set role service_role; select public.write_history_document('nhl','slate_board_points','2020-01-08',"
  + [checksum(unrelated),JSON.stringify(unrelated)].map(escape).join(',') + ",0,'2020-01-08T20:00:00Z');");

process.env.SUPABASE_URL = 'https://test.invalid';
process.env.SUPABASE_SECRET_KEY = 'test-only-placeholder';
delete process.env.SACH_ENABLE_WORKER_HISTORY_WRITES;
Object.defineProperty(globalThis, 'navigator', {value:{userAgent:'Cloudflare-Workers'},configurable:true});
let reads = 0;
globalThis.fetch = async (address, options) => {
  const u = new URL(address);
  assert.equal(u.origin,'https://test.invalid');
  assert.equal(u.pathname,'/rest/v1/history_documents');
  assert.equal(options.method ?? 'GET','GET');
  assert.equal(u.searchParams.get('select'),'payload,checksum');
  const condition = ['sport','stream','game_date'].map(key=>{
    const value=u.searchParams.get(key);
    assert.match(value,/^eq\.[a-z0-9_-]+$/);
    return key+'='+escape(value.slice(3));
  }).join(' and ');
  reads++;
  return Response.json(JSON.parse(sql("set role service_role; select coalesce(json_agg(r),'[]') from (select payload,checksum from public.history_documents where "+condition+") r;")));
};
assert.equal(cloudHistoryReadOnly(),true);
assert.deepEqual(await readCloudDocument('nba','slate_board_points','2020-01-08'),[{legacy:true}]);
assert.deepEqual(await readCloudDocument('nba','slate_board_threes_made',day),board);
assert.deepEqual(await readCloudDocument('nhl','slate_board_points','2020-01-08'),unrelated);
assert.equal(await readCloudDocument('nba','slate_board_first_basket',day),null);
assert.equal(await saveCloudDocument('nba','slate_board_threes_made',day,[]),false);
assert.equal(reads,4);
console.log('PASS version 335 history client reads legacy, guarded and unrelated rows with valid checksums, handles a missing board and keeps Worker writes disabled');
