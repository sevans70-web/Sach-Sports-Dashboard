-- Run using psql -X -v ON_ERROR_STOP=1 in a disposable local cluster only.
-- The cluster must already provide empty test roles anon, authenticated,
-- and service_role (BYPASSRLS, no membership in the fixture database owner).
do $check$
begin
  if inet_server_addr() is not null
     or current_database() !~ '^sach_nba_board_test_[a-z0-9_]+$'
     or to_regclass('public.history_documents') is not null then
    raise exception 'Use an empty disposable sach_nba_board_test_* database over a local socket';
  end if;
end;
$check$;

\ir ../migrations/history-cloud-schema.sql
\ir ../migrations/history-document-version-order.sql

-- This old original must remain readable and immutable without a new receipt.
insert into public.history_documents (sport, stream, game_date, checksum, payload)
values ('nba', 'slate_board_points', '2020-01-08',
  encode(sha256(convert_to('[{"legacy":true}]', 'UTF8')), 'hex'), '[{"legacy":true}]');

\ir ../migrations/nba-canonical-board-admission.sql

create table public.fixture_nba_slates (name text primary key, day date, tip timestamptz);
insert into public.fixture_nba_slates
select name, (tip at time zone 'America/Toronto')::date, tip
from (values ('upcoming', clock_timestamp()+interval '10 minutes'),
             ('elapsed', clock_timestamp()-interval '2 days')) as times(name, tip);

create function public.fixture_iso(p_timestamp timestamptz) returns text
language sql stable as $$
  select to_char(p_timestamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$$;

insert into nba_board_admission.verified_slates(
  game_date, fixtures, source_uri, source_sha256, verified_at, valid_until)
select day, jsonb_build_object('10001',public.fixture_iso(tip)),
       'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates='||to_char(day,'YYYYMMDD'),
       repeat('a',64), tip-interval '1 day', clock_timestamp()+interval '1 hour'
from public.fixture_nba_slates;

create function public.fixture_nba_put(p_slate text,p_market text,p_quote text,p_mode text default 'insert')
returns void language plpgsql as $$
declare
  s public.fixture_nba_slates%rowtype;
  captured timestamptz;
  payload jsonb;
  digest text;
begin
  select * into strict s from public.fixture_nba_slates where name=p_slate;
  captured := date_trunc('milliseconds',least(clock_timestamp(),s.tip-interval '1 minute'));
  digest := lpad(md5(p_quote),64,'0');
  payload := jsonb_build_array(jsonb_build_object(
    'version',1,'captureSource','dashboard_worker','market',p_market,'day',s.day,
    'capturedAt',public.fixture_iso(captured),
    'lockAt',public.fixture_iso(s.tip+case when p_mode='wrong-lock' then interval '1 hour' else interval '0' end),
    'captureSchedule',jsonb_build_object('10001',public.fixture_iso(s.tip)),
    'rows',jsonb_build_array(jsonb_build_object(
      'sport','nba','market',p_market,'rank',1,'gameId','10001','playerId','1234',
      'gameTime',public.fixture_iso(s.tip),'quoteId',p_quote,
      'quoteUpdatedAt',public.fixture_iso(captured),'quoteVerified',true
    ))
  ));
  if p_mode='legacy' then
    perform public.write_history_document('nba','slate_board_'||p_market,s.day,digest,payload,0,captured);
  else
    insert into public.history_documents(sport,stream,game_date,checksum,payload,source_updated_at)
    values ('nba','slate_board_'||p_market,s.day,digest,payload,captured)
    on conflict (sport,stream,game_date) do nothing;
  end if;
end;
$$;

grant select on public.fixture_nba_slates to service_role;
grant delete, truncate on public.history_documents to service_role;

set role service_role;
do $tests$
declare
  first_row public.history_documents%rowtype;
  after_row public.history_documents%rowtype;
  observed jsonb;
  detail text;
begin
  select public.verified_nba_board_schedule(day) into observed
    from public.fixture_nba_slates where name='upcoming';
  if observed ->> '10001' is null then raise exception 'read-only schedule preflight did not return the fixture'; end if;
  begin
    perform 1 from nba_board_admission.verified_slates;
    raise exception 'service_role read the private approval table';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.fixture_nba_put('upcoming','points','wrong-lock','wrong-lock');
    raise exception 'a caller-supplied later cutoff was accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.fixture_nba_put('elapsed','points','after-tipoff');
    raise exception 'an after-tipoff insert was accepted';
  exception when check_violation then null;
  end;

  perform public.fixture_nba_put('upcoming','points','first');
  select * into strict first_row from public.history_documents
    where sport='nba' and stream='slate_board_points' and game_date=(select day from public.fixture_nba_slates where name='upcoming');
  if first_row.updated_at >= (select tip from public.fixture_nba_slates where name='upcoming')
     or first_row.payload #>> '{0,rows,0,quoteId}' <> 'first' then
    raise exception 'incorrect first board or recorded admission timestamp';
  end if;
  perform public.fixture_nba_put('upcoming','points','second');
  begin
    perform public.fixture_nba_put('upcoming','points','legacy-overwrite','legacy');
    raise exception 'legacy RPC overwrote the first board';
  exception when check_violation then
    get stacked diagnostics detail = message_text;
    if detail <> 'canonical NBA originals are immutable' then raise; end if;
  end;
  begin
    update public.history_documents set checksum=repeat('c',64)
      where sport='nba' and stream='slate_board_points';
    raise exception 'direct UPDATE bypassed the guard';
  exception when check_violation then null;
  end;
  begin
    update public.history_documents set stream='slate_board_rebounds'
      where sport='nba' and stream='slate_board_points';
    raise exception 'rekey from protected history bypassed the guard';
  exception when check_violation then null;
  end;
  begin
    delete from public.history_documents where sport='nba' and stream='slate_board_points';
    raise exception 'direct DELETE bypassed the guard';
  exception when check_violation then null;
  end;
  begin
    truncate public.history_documents;
    raise exception 'TRUNCATE removed protected history';
  exception when check_violation then null;
  end;
  select * into strict after_row from public.history_documents
    where sport='nba' and stream='slate_board_points' and game_date=first_row.game_date;
  if after_row is distinct from first_row then raise exception 'first canonical row changed'; end if;

  perform public.write_history_document('nhl','slate_board_points','2020-01-08',repeat('a',64),'[]',0,'2020-01-08T18:00:00Z');
  perform public.write_history_document('nhl','slate_board_points','2020-01-08',repeat('b',64),'[1]',0,'2020-01-08T19:00:00Z');
  perform public.write_history_document('nba','featured_points','2020-01-08',repeat('b',64),'[2]',0,'2020-01-08T19:00:00Z');
  begin
    update public.history_documents set stream='slate_board_points'
      where sport='nba' and stream='featured_points';
    raise exception 'rekey into protected history bypassed the guard';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.history_documents where sport='nhl' and payload='[1]')
     or not exists (select 1 from public.history_documents where sport='nba' and stream='featured_points' and payload='[2]')
     or not exists (select 1 from public.history_documents where sport='nba' and stream='slate_board_points' and payload='[{"legacy":true}]') then
    raise exception 'unrelated writes or legacy reads regressed';
  end if;
end;
$tests$;
reset role;
