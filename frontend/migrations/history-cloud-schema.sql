create table public.history_documents (
 sport text not null, stream text not null, game_date date not null,
 checksum text not null, payload jsonb not null, source_bytes bigint not null default 0,
 updated_at timestamptz not null default now(), primary key(sport,stream,game_date));
create index history_documents_date on public.history_documents(sport,game_date);
create table public.history_archive_files (
 relative_path text not null, md5 text not null, drive_file_id text not null,
 source_bytes bigint not null, game_date date, sport text, verified_at timestamptz not null default now(),
 primary key(relative_path,md5));
create index history_archive_files_scope on public.history_archive_files(sport,game_date);
alter table public.history_documents enable row level security;
alter table public.history_archive_files enable row level security;
revoke all on public.history_documents,public.history_archive_files from anon,authenticated;
grant select,insert,update on public.history_documents,public.history_archive_files to service_role;
