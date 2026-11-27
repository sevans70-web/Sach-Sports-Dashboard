-- Draft for separate approval. Apply as the history table owner.
begin;

create schema nba_board_admission;
revoke all on schema nba_board_admission from public, anon, authenticated, service_role;

-- An independent operator verifies the complete official Toronto slate and
-- records its normalized game ID -> UTC tipoff map and archived response hash.
-- The dashboard credential cannot create, refresh, or change an approval.
create table nba_board_admission.verified_slates (
  game_date date primary key,
  fixtures jsonb not null check (jsonb_typeof(fixtures) = 'object' and fixtures <> '{}'::jsonb),
  source_uri text not null check (source_uri ~ '^https://site[.]api[.]espn[.]com/apis/site/v2/sports/basketball/nba/scoreboard[?]dates=[0-9]{8}$'),
  source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
  verified_at timestamptz not null default clock_timestamp(),
  valid_until timestamptz not null check (isfinite(valid_until) and valid_until > verified_at),
  check (isfinite(verified_at))
);
revoke all on nba_board_admission.verified_slates from public, anon, authenticated, service_role;

-- Read-only preflight over PostgREST. Missing or expired approval prevents the
-- Worker from attempting its INSERT, including before this migration exists.
create function public.verified_nba_board_schedule(p_day date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $schedule$
  select s.fixtures
    from nba_board_admission.verified_slates s
    where s.game_date = p_day and s.verified_at <= statement_timestamp()
      and s.valid_until > statement_timestamp()
$schedule$;
revoke all on function public.verified_nba_board_schedule(date) from public, anon, authenticated, service_role;
grant execute on function public.verified_nba_board_schedule(date) to service_role;

create function nba_board_admission.guard_history_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $guard$
declare
  approval nba_board_admission.verified_slates%rowtype;
  board jsonb;
  fixture record;
  card record;
  fixture_tip timestamptz;
  first_tip timestamptz;
  captured timestamptz;
  admitted timestamptz;
  market text;
  ids text[] := '{}';
  identity text;
begin
  if tg_op = 'TRUNCATE' then
    if exists (
      select 1 from public.history_documents
      where sport = 'nba' and left(stream, 12) = 'slate_board_'
    ) then
      raise exception 'canonical NBA originals are immutable' using errcode = '23514';
    end if;
    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.sport = 'nba' and left(old.stream, 12) = 'slate_board_' then
      raise exception 'canonical NBA originals are immutable' using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if (old.sport = 'nba' and left(old.stream, 12) = 'slate_board_')
       or (new.sport = 'nba' and left(new.stream, 12) = 'slate_board_') then
      if new is distinct from old then
        raise exception 'canonical NBA originals are immutable' using errcode = '23514';
      end if;
    end if;
    return new;
  end if;

  -- Only canonical NBA slate-board inserts use this admission path.
  if new.sport <> 'nba' or left(new.stream, 12) <> 'slate_board_' then
    return new;
  end if;

  market := substr(new.stream, 13);
  if market not in (
       'points', 'rebounds', 'assists', 'threes_made', 'steals', 'blocks',
       'pts_rebs_asts', 'pts_rebs', 'pts_asts', 'rebs_asts', 'first_basket',
       'q1_points', 'q1_rebounds', 'q1_assists'
     ) or new.checksum !~ '^[0-9a-f]{64}$'
       or jsonb_typeof(new.payload) is distinct from 'array' then
    raise exception 'invalid canonical NBA board document' using errcode = '23514';
  end if;
  if jsonb_array_length(new.payload) <> 1 then
    raise exception 'invalid canonical NBA board envelope' using errcode = '23514';
  end if;
  board := new.payload -> 0;
  if board ->> 'version' is distinct from '1'
     or board ->> 'captureSource' is distinct from 'dashboard_worker'
     or board ->> 'market' is distinct from market
     or board ->> 'day' is distinct from to_char(new.game_date, 'YYYY-MM-DD')
     or coalesce(board ->> 'capturedAt', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
     or coalesce(board ->> 'lockAt', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
     or jsonb_typeof(board -> 'rows') is distinct from 'array' then
    raise exception 'invalid canonical NBA capture scope' using errcode = '23514';
  end if;
  if jsonb_array_length(board -> 'rows') not between 1 and 25 then
    raise exception 'invalid canonical NBA board size' using errcode = '23514';
  end if;

  -- Acquire this lock before checking the wall clock. Every canonical insert,
  -- including INSERT .. ON CONFLICT and the legacy RPC, goes through the trigger.
  perform pg_advisory_xact_lock(hashtextextended(
    'sach:nba:canonical:' || new.stream || ':' || new.game_date::text, 0
  ));
  select * into approval from nba_board_admission.verified_slates s
    where s.game_date = new.game_date for share;
  if not found or board -> 'captureSchedule' is distinct from approval.fixtures then
    raise exception 'capture requires an independently verified NBA schedule' using errcode = '23514';
  end if;

  for fixture in select * from jsonb_each_text(approval.fixtures) loop
    if fixture.key !~ '^[0-9]{1,24}$'
       or coalesce(fixture.value, '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' then
      raise exception 'invalid approved NBA fixture' using errcode = '23514';
    end if;
    fixture_tip := fixture.value::timestamptz;
    if (fixture_tip at time zone 'America/Toronto')::date <> new.game_date then
      raise exception 'approved NBA fixture is on the wrong Toronto slate' using errcode = '23514';
    end if;
    first_tip := least(first_tip, fixture_tip);
  end loop;
  captured := (board ->> 'capturedAt')::timestamptz;
  if first_tip is null or (board ->> 'lockAt')::timestamptz <> first_tip
     or captured >= first_tip or captured < approval.verified_at
     or new.source_updated_at is distinct from captured then
    raise exception 'NBA board timestamps do not match the approved slate' using errcode = '23514';
  end if;

  for card in select * from jsonb_array_elements(board -> 'rows') with ordinality loop
    identity := (card.value ->> 'gameId') || ':' || (card.value ->> 'playerId');
    if card.value ->> 'sport' is distinct from 'nba'
       or card.value ->> 'market' is distinct from market
       or card.value ->> 'rank' is distinct from card.ordinality::text
       or coalesce(card.value ->> 'playerId', '') !~ '^[0-9]{1,24}$'
       or coalesce(card.value ->> 'quoteId', '') = ''
       or card.value -> 'quoteVerified' is distinct from 'true'::jsonb
       or approval.fixtures ->> (card.value ->> 'gameId') is null
       or coalesce(card.value ->> 'gameTime', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?Z$'
       or coalesce(card.value ->> 'quoteUpdatedAt', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}(:[0-9]{2}([.][0-9]+)?)?Z$' then
      raise exception 'invalid verified NBA board row' using errcode = '23514';
    end if;
    if (card.value ->> 'gameTime')::timestamptz <> (approval.fixtures ->> (card.value ->> 'gameId'))::timestamptz
       or (card.value ->> 'quoteUpdatedAt')::timestamptz > captured
       or identity = any(ids) then
      raise exception 'NBA board row evidence conflicts with the approved slate' using errcode = '23514';
    end if;
    ids := array_append(ids, identity);
  end loop;

  -- Admission time is server wall clock after lock wait and validation.
  -- PostgreSQL can still commit the transaction later.
  admitted := clock_timestamp();
  if admitted >= first_tip or admitted >= approval.valid_until or captured > admitted then
    raise exception 'canonical NBA board admission is closed' using errcode = '23514';
  end if;
  new.updated_at := admitted;
  return new;
end;
$guard$;

revoke all on function nba_board_admission.guard_history_document() from public, anon, authenticated, service_role;
create trigger guard_nba_canonical_history_rows
  before insert or update or delete on public.history_documents
  for each row execute function nba_board_admission.guard_history_document();
create trigger guard_nba_canonical_history_truncate
  before truncate on public.history_documents
  for each statement execute function nba_board_admission.guard_history_document();

commit;
