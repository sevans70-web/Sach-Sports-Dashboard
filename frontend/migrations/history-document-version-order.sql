alter table public.history_documents add column source_updated_at timestamptz not null default now();
create function public.write_history_document(p_sport text,p_stream text,p_day date,p_checksum text,p_payload jsonb,p_source_bytes bigint,p_source_updated_at timestamptz)
returns void language sql security invoker set search_path='' as $$
 insert into public.history_documents(sport,stream,game_date,checksum,payload,source_bytes,updated_at,source_updated_at)
 values(p_sport,p_stream,p_day,p_checksum,p_payload,p_source_bytes,now(),p_source_updated_at)
 on conflict(sport,stream,game_date) do update set checksum=excluded.checksum,payload=excluded.payload,source_bytes=excluded.source_bytes,updated_at=now(),source_updated_at=excluded.source_updated_at
 where public.history_documents.source_updated_at<=excluded.source_updated_at and public.history_documents.checksum<>excluded.checksum;
$$;
revoke all on function public.write_history_document(text,text,date,text,jsonb,bigint,timestamptz) from public,anon,authenticated;
grant execute on function public.write_history_document(text,text,date,text,jsonb,bigint,timestamptz) to service_role;
