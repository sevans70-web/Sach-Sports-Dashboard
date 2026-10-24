create table public.history_player_games (
 sport text not null, player_id text not null, game_id text not null, market text not null,
 game_time timestamptz not null, actual numeric not null, point jsonb not null,
 source text not null, observed_at timestamptz not null default now(),
 primary key(sport,player_id,game_id,market));
create index history_player_games_lookup on public.history_player_games(sport,player_id,market,game_time desc);
alter table public.history_player_games enable row level security;
revoke all on public.history_player_games from anon,authenticated;
grant select,insert,update on public.history_player_games to service_role;
